import { prisma } from "@/lib/prisma";
import { readSetting, writeSetting } from "@/lib/push";
import { HIGHLIGHT_ARTICLE_INCLUDE } from "@/lib/highlights";
import { isSealed, open, seal } from "@/lib/secret-box";

// Highlights sent to Readwise or a Notion database, by hand ("Send now") and after each
// hourly refresh (new ones only). The tokens are the reader's own, pasted in Highlights →
// Send to…; they stay in the database (the `highlight-exports` Setting), encrypted
// (lib/secret-box.ts), and never go back to the browser. What was sent where is marked on
// each highlight (`exportedTo`), so nothing goes twice. The API addresses can be pointed
// elsewhere for tests.

const READWISE = process.env.READWISE_API_URL || "https://readwise.io/api/v2";
const NOTION = process.env.NOTION_API_URL || "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const KEY = "highlight-exports";
const PAGES_KEY = "notion-pages";

export type ExportService = "readwise" | "notion";

interface ExportSettings {
  readwise: { token?: string; lastAt?: string; count?: number };
  notion: { token?: string; databaseId?: string; lastAt?: string; count?: number };
}

const EMPTY: ExportSettings = { readwise: {}, notion: {} };

export class ExportError extends Error {}

/** The settings with the tokens readable (in memory only). */
async function settings(): Promise<ExportSettings> {
  const value = await readSetting<ExportSettings>(KEY, EMPTY);
  const out: ExportSettings = { readwise: { ...value.readwise }, notion: { ...value.notion } };
  let legacy = false;
  for (const service of ["readwise", "notion"] as const) {
    const stored = out[service].token;
    if (!stored) continue;
    if (isSealed(stored)) {
      // Unreadable (the server's secret changed): as good as not connected.
      out[service].token = open(stored) ?? undefined;
    } else legacy = true;
  }
  // Tokens saved before they were encrypted: seal them now.
  if (legacy) await save(out);
  return out;
}

function save(s: ExportSettings) {
  const sealed: ExportSettings = { readwise: { ...s.readwise }, notion: { ...s.notion } };
  for (const service of ["readwise", "notion"] as const) {
    const token = sealed[service].token;
    if (token) sealed[service].token = seal(token);
  }
  return writeSetting(KEY, sealed);
}

/** What the browser may know: connected or not, and when it last sent. No tokens. */
export async function exportStatus() {
  const s = await settings();
  return {
    readwise: { connected: Boolean(s.readwise.token), lastAt: s.readwise.lastAt ?? null },
    notion: {
      connected: Boolean(s.notion.token && s.notion.databaseId),
      lastAt: s.notion.lastAt ?? null,
    },
  };
}

type HighlightRow = Awaited<ReturnType<typeof highlightsToSend>>[number];

/** Highlights not yet sent to this service (or every one, to send again), oldest first. */
function highlightsToSend(service: ExportService, all: boolean) {
  return prisma.highlight.findMany({
    where: all ? {} : { NOT: { exportedTo: { has: service } } },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: HIGHLIGHT_ARTICLE_INCLUDE,
  });
}

/** Readwise's highlight format. Exported for tests. */
export function readwisePayload(highlights: HighlightRow[]) {
  return {
    highlights: highlights.map((h) => ({
      text: h.text.slice(0, 8191),
      title: h.article.title.slice(0, 511),
      author: (h.article.author || h.article.feed.title).slice(0, 1024),
      source_url: h.article.link,
      source_type: "reader_app",
      category: "articles",
      note: h.note ? h.note.slice(0, 8191) : undefined,
      highlighted_at: h.createdAt.toISOString(),
    })),
  };
}

/** A Notion page's blocks for highlights: each a quote, its note under it. For tests too. */
export function notionBlocks(highlights: Pick<HighlightRow, "text" | "note">[]) {
  const text = (content: string) => [{ type: "text", text: { content: content.slice(0, 1990) } }];
  return highlights.flatMap((h) => [
    { object: "block", type: "quote", quote: { rich_text: text(h.text) } },
    ...(h.note
      ? [{ object: "block", type: "paragraph", paragraph: { rich_text: text(`↳ ${h.note}`) } }]
      : []),
  ]);
}

async function call(url: string, init: RequestInit, service: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) {
    throw new ExportError(`${service} refused the token. Paste a new one.`);
  }
  if (res.status === 404)
    throw new ExportError(`${service} can't find that. Check the link or ID.`);
  if (!res.ok) throw new ExportError(`${service} answered ${res.status}.`);
  return res;
}

const readwiseHeaders = (token: string) => ({
  Authorization: `Token ${token}`,
  "Content-Type": "application/json",
});
const notionHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
});

/** A Notion database link or bare ID, as the 32-character ID. Exported for tests. */
export function notionDatabaseId(input: string) {
  const match = input.replace(/-/g, "").match(/[0-9a-f]{32}/i);
  return match ? match[0] : null;
}

/** Checks the token (and database) works, then saves it. */
export async function connect(service: ExportService, token: string, database?: string) {
  const s = await settings();
  if (service === "readwise") {
    await call(`${READWISE}/auth/`, { headers: readwiseHeaders(token) }, "Readwise");
    s.readwise = { ...s.readwise, token };
  } else {
    const databaseId = notionDatabaseId(database ?? "");
    if (!databaseId) throw new ExportError("That doesn't look like a Notion database link or ID.");
    await call(`${NOTION}/databases/${databaseId}`, { headers: notionHeaders(token) }, "Notion");
    // Another database starts empty: everything is to send there.
    if (s.notion.databaseId && s.notion.databaseId !== databaseId) await forget("notion");
    s.notion = { ...s.notion, token, databaseId };
  }
  await save(s);
}

export async function disconnect(service: ExportService) {
  const s = await settings();
  s[service] = {};
  await save(s);
}

/** Forgets what was sent to a service, so everything counts as new there. */
async function forget(service: ExportService) {
  const sent = await prisma.highlight.findMany({
    where: { exportedTo: { has: service } },
    select: { id: true, exportedTo: true },
  });
  for (const h of sent) {
    await prisma.highlight.update({
      where: { id: h.id },
      data: { exportedTo: h.exportedTo.filter((x) => x !== service) },
    });
  }
  if (service === "notion") await writeSetting(PAGES_KEY, {});
}

function markSent(service: ExportService, ids: string[]) {
  return prisma.highlight.updateMany({
    where: { id: { in: ids }, NOT: { exportedTo: { has: service } } },
    data: { exportedTo: { push: service } },
  });
}

async function sendToReadwise(token: string, highlights: HighlightRow[]) {
  for (let i = 0; i < highlights.length; i += 100) {
    const batch = highlights.slice(i, i + 100);
    await call(
      `${READWISE}/highlights/`,
      {
        method: "POST",
        headers: readwiseHeaders(token),
        body: JSON.stringify(readwisePayload(batch)),
      },
      "Readwise"
    );
    await markSent(
      "readwise",
      batch.map((h) => h.id)
    );
  }
}

/** One page per article in the database; later highlights are added to its page. */
async function sendToNotion(token: string, databaseId: string, highlights: HighlightRow[]) {
  const pages = await readSetting<Record<string, string>>(PAGES_KEY, {});
  const database = (await (
    await call(`${NOTION}/databases/${databaseId}`, { headers: notionHeaders(token) }, "Notion")
  ).json()) as { properties?: Record<string, { type?: string }> };
  const titleProperty =
    Object.entries(database.properties ?? {}).find(([, p]) => p.type === "title")?.[0] ?? "Name";
  const byArticle = new Map<string, HighlightRow[]>();
  for (const h of highlights)
    byArticle.set(h.articleId, [...(byArticle.get(h.articleId) ?? []), h]);
  for (const [articleId, items] of byArticle) {
    const blocks = notionBlocks(items);
    const existing = pages[`${databaseId}:${articleId}`];
    if (existing) {
      try {
        for (let i = 0; i < blocks.length; i += 100) {
          await call(
            `${NOTION}/blocks/${existing}/children`,
            {
              method: "PATCH",
              headers: notionHeaders(token),
              body: JSON.stringify({ children: blocks.slice(i, i + 100) }),
            },
            "Notion"
          );
        }
        await markSent(
          "notion",
          items.map((h) => h.id)
        );
        continue;
      } catch (error) {
        // The page was deleted in Notion: make a new one below.
        if (!(error instanceof ExportError && /can't find/.test(error.message))) throw error;
      }
    }
    const article = items[0].article;
    const page = (await (
      await call(
        `${NOTION}/pages`,
        {
          method: "POST",
          headers: notionHeaders(token),
          body: JSON.stringify({
            parent: { database_id: databaseId },
            properties: {
              [titleProperty]: { title: [{ text: { content: article.title.slice(0, 1990) } }] },
            },
            children: [
              {
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: article.feed.title, link: { url: article.link } },
                    },
                  ],
                },
              },
              ...blocks.slice(0, 99),
            ],
          }),
        },
        "Notion"
      )
    ).json()) as { id: string };
    pages[`${databaseId}:${articleId}`] = page.id;
    await writeSetting(PAGES_KEY, pages);
    await markSent(
      "notion",
      items.map((h) => h.id)
    );
  }
}

/**
 * Sends the highlights a service doesn't have yet (up to 500 a time). With `all`, sends
 * everything again: Readwise recognises what it has; Notion gets fresh pages (the old ones
 * are left alone), so that's for a database that was emptied. Returns how many went.
 * Throws ExportError with a readable message.
 */
export async function sendHighlights(service: ExportService, { all = false } = {}) {
  const s = await settings();
  const conf = s[service];
  if (!conf.token || (service === "notion" && !s.notion.databaseId)) {
    throw new ExportError("Not connected.");
  }
  if (all && service === "notion") await forget("notion");
  const highlights = await highlightsToSend(service, all && service === "readwise");
  if (highlights.length) {
    if (service === "readwise") await sendToReadwise(conf.token, highlights);
    else await sendToNotion(conf.token, s.notion.databaseId!, highlights);
  }
  const fresh = await settings();
  fresh[service] = { ...fresh[service], lastAt: new Date().toISOString() };
  await save(fresh);
  return highlights.length;
}

/** After each hourly refresh: new highlights to whatever is connected. */
export async function runHighlightExports() {
  const status = await exportStatus();
  let sent = 0;
  for (const service of ["readwise", "notion"] as const) {
    if (!status[service].connected) continue;
    try {
      sent += await sendHighlights(service);
    } catch (error) {
      // A revoked token or a deleted database: Highlights → Send to… shows it on the next
      // manual send; it isn't the app breaking.
      if (error instanceof ExportError)
        console.warn(`Highlight export to ${service}: ${error.message}`);
      else throw error;
    }
  }
  return sent;
}
