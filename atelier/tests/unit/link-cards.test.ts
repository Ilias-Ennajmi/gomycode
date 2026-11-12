import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import {
  createEmbed,
  createLinkCard,
  createPlainLinkCard,
  isPreviewPending,
  LINK_CARD_H,
  LINK_CARD_PLAIN_H,
  LinkPreviewUnavailable,
  loadLinkPreview,
  previewSettled,
  retryLinkPreview,
  type LinkCardDeps,
} from "@/lib/engine/links/link-cards";
import { classifyUrl } from "@/lib/engine/links/classify";
import type { EmbedObj, LinkObj } from "@/lib/engine/model/types";
import type { LinkPreview } from "@/lib/server/open-graph";

const PREVIEW: LinkPreview = {
  title: "A fine page",
  description: "About the page",
  siteName: "Example",
  imageUrl: "https://example.com/og.png",
  faviconUrl: null,
  finalUrl: "https://example.com/page",
};

function setup(over: Partial<LinkCardDeps> = {}) {
  const doc = new BoardDoc();
  doc.stopCapturing();
  let isOnline = true;
  const onlineCbs: (() => void)[] = [];
  const deps = {
    fetchPreview: vi.fn(async () => PREVIEW),
    fetchImage: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    uploader: { addAssetOnly: vi.fn(async () => "asset-1") },
    online: () => isOnline,
    whenOnline: (cb: () => void) => {
      onlineCbs.push(cb);
      return () => {};
    },
    ...over,
  } as LinkCardDeps & { fetchPreview: ReturnType<typeof vi.fn>; fetchImage: ReturnType<typeof vi.fn> };
  return {
    doc,
    deps,
    goOnline() {
      isOnline = true;
      for (const cb of onlineCbs.splice(0)) cb();
    },
    goOffline() {
      isOnline = false;
    },
  };
}
const link = (doc: BoardDoc, id: string) => doc.get(id) as LinkObj;

afterEach(() => vi.restoreAllMocks());

describe("createLinkCard", () => {
  it("creates a loading card with the hostname at once, then fills it in", async () => {
    const { doc, deps } = setup();
    const id = createLinkCard(doc, "https://example.com/page", { x: 500, y: 400 }, deps);
    const first = link(doc, id);
    expect(first).toMatchObject({ type: "link", status: "loading", title: "example.com", url: "https://example.com/page", w: 320, h: 240 });
    expect(first.x).toBe(340);
    expect(first.y).toBe(280);
    expect(isPreviewPending(doc, id)).toBe(true);
    await previewSettled(doc, id);
    expect(link(doc, id)).toMatchObject({ status: "ready", title: "A fine page", description: "About the page", siteName: "Example", imageAssetId: "asset-1", h: LINK_CARD_H });
    expect(deps.fetchPreview).toHaveBeenCalledTimes(1);
    expect(deps.fetchImage).toHaveBeenCalledWith("https://example.com/og.png");
    expect(deps.uploader.addAssetOnly).toHaveBeenCalledTimes(1);
    expect(isPreviewPending(doc, id)).toBe(false);
  });

  it("is one undo step: filling in the preview never adds one", async () => {
    const { doc, deps } = setup();
    const id = createLinkCard(doc, "https://example.com/page", { x: 0, y: 0 }, deps);
    await previewSettled(doc, id);
    expect(link(doc, id).status).toBe("ready");
    doc.undo();
    expect(doc.get(id)).toBeUndefined();
    expect(doc.canUndo()).toBe(false);
  });

  it("marks the card failed (keeping the domain) when the preview fails, and shrinks it", async () => {
    const { doc, deps } = setup({ fetchPreview: vi.fn(async () => Promise.reject(new Error("502"))) });
    const id = createLinkCard(doc, "https://example.com/page", { x: 0, y: 0 }, deps);
    await previewSettled(doc, id);
    expect(link(doc, id)).toMatchObject({ status: "failed", title: "example.com", h: LINK_CARD_PLAIN_H });
    expect(deps.fetchImage).not.toHaveBeenCalled();
  });

  it("local-only (no server) leaves a plain ready card with just the domain", async () => {
    const { doc, deps } = setup({ fetchPreview: vi.fn(async () => Promise.reject(new LinkPreviewUnavailable())) });
    const id = createLinkCard(doc, "https://www.example.com/page", { x: 0, y: 0 }, deps);
    await previewSettled(doc, id);
    expect(link(doc, id)).toMatchObject({ status: "ready", title: "www.example.com", siteName: "www.example.com", description: "", imageAssetId: null, h: LINK_CARD_PLAIN_H });
  });

  it("keeps a card without a picture plain, and survives a failed image", async () => {
    const a = setup({ fetchPreview: vi.fn(async () => ({ ...PREVIEW, imageUrl: null })) });
    const ida = createLinkCard(a.doc, "https://example.com/a", { x: 0, y: 0 }, a.deps);
    await previewSettled(a.doc, ida);
    expect(link(a.doc, ida)).toMatchObject({ status: "ready", imageAssetId: null, h: LINK_CARD_PLAIN_H, title: "A fine page" });
    expect(a.deps.fetchImage).not.toHaveBeenCalled();

    const b = setup({ fetchImage: vi.fn(async () => Promise.reject(new Error("boom"))) });
    const idb = createLinkCard(b.doc, "https://example.com/b", { x: 0, y: 0 }, b.deps);
    await previewSettled(b.doc, idb);
    expect(link(b.doc, idb)).toMatchObject({ status: "ready", imageAssetId: null, title: "A fine page", h: LINK_CARD_PLAIN_H });
  });

  it("does not resize a card the owner already resized", async () => {
    const { doc, deps } = setup({ fetchPreview: vi.fn(async () => ({ ...PREVIEW, imageUrl: null })) });
    const id = createLinkCard(doc, "https://example.com/a", { x: 0, y: 0 }, deps);
    doc.update(id, { h: 400 });
    await previewSettled(doc, id);
    expect(link(doc, id).h).toBe(400);
  });

  it("offline: no fetch until online, then exactly one", async () => {
    const t = setup();
    t.goOffline();
    const id = createLinkCard(t.doc, "https://example.com/page", { x: 0, y: 0 }, t.deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.deps.fetchPreview).not.toHaveBeenCalled();
    expect(link(t.doc, id).status).toBe("loading");
    expect(isPreviewPending(t.doc, id)).toBe(true);
    t.goOnline();
    await previewSettled(t.doc, id);
    expect(t.deps.fetchPreview).toHaveBeenCalledTimes(1);
    expect(link(t.doc, id).status).toBe("ready");
  });

  it("skips the image when the network went away meanwhile", async () => {
    const t = setup();
    t.deps.fetchPreview.mockImplementation(async () => {
      t.goOffline();
      return PREVIEW;
    });
    const id = createLinkCard(t.doc, "https://example.com/page", { x: 0, y: 0 }, t.deps);
    await previewSettled(t.doc, id);
    expect(t.deps.fetchImage).not.toHaveBeenCalled();
    expect(link(t.doc, id)).toMatchObject({ status: "ready", title: "A fine page" });
  });

  it("never fetches twice for the same object", async () => {
    const { doc, deps } = setup();
    const id = createLinkCard(doc, "https://example.com/page", { x: 0, y: 0 }, deps);
    void loadLinkPreview(doc, id, deps);
    void loadLinkPreview(doc, id, deps);
    await previewSettled(doc, id);
    expect(deps.fetchPreview).toHaveBeenCalledTimes(1);
  });

  it("stops quietly when the card is deleted meanwhile", async () => {
    const { doc, deps } = setup();
    const id = createLinkCard(doc, "https://example.com/page", { x: 0, y: 0 }, deps);
    doc.remove([id]);
    await previewSettled(doc, id);
    expect(doc.get(id)).toBeUndefined();
    expect(deps.uploader.addAssetOnly).not.toHaveBeenCalled();
  });

  it("retry runs the fetch again for a failed card", async () => {
    const t = setup();
    t.deps.fetchPreview.mockRejectedValueOnce(new Error("503"));
    const id = createLinkCard(t.doc, "https://example.com/page", { x: 0, y: 0 }, t.deps);
    await previewSettled(t.doc, id);
    expect(link(t.doc, id).status).toBe("failed");
    const p = retryLinkPreview(t.doc, id, t.deps);
    expect(link(t.doc, id).status).toBe("loading");
    await p;
    expect(link(t.doc, id).status).toBe("ready");
    expect(t.deps.fetchPreview).toHaveBeenCalledTimes(2);
  });

  it("refuses an address that is not http(s)", () => {
    const { doc, deps } = setup();
    expect(() => createLinkCard(doc, "javascript:alert(1)", { x: 0, y: 0 }, deps)).toThrow();
    expect(doc.all()).toHaveLength(0);
  });

  it("runs at most two preview fetches at once", async () => {
    const t = setup();
    let active = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    t.deps.fetchPreview.mockImplementation(
      () =>
        new Promise((resolve) => {
          active++;
          peak = Math.max(peak, active);
          gates.push(() => {
            active--;
            resolve({ ...PREVIEW, imageUrl: null });
          });
        }),
    );
    const ids = Array.from({ length: 5 }, (_, i) => createLinkCard(t.doc, `https://example.com/${i}`, { x: i * 400, y: 0 }, t.deps));
    await Promise.resolve();
    await Promise.resolve();
    expect(t.deps.fetchPreview).toHaveBeenCalledTimes(2);
    while (gates.length < 5) {
      gates.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
      if (active === 0 && t.deps.fetchPreview.mock.calls.length >= 5) break;
    }
    for (const g of gates.splice(0)) g();
    await Promise.all(ids.map((id) => previewSettled(t.doc, id)));
    expect(peak).toBe(2);
    expect(ids.every((id) => link(t.doc, id).status === "ready")).toBe(true);
  });
});

describe("createPlainLinkCard and createEmbed", () => {
  it("makes a finished domain-only card", () => {
    const doc = new BoardDoc();
    const id = createPlainLinkCard(doc, "https://example.com/a", { x: 0, y: 0 });
    expect(link(doc, id)).toMatchObject({ status: "ready", title: "example.com", h: LINK_CARD_PLAIN_H });
  });
  it("makes a 480-wide embed with the height from the aspect, and a 480-tall one for portrait video", () => {
    const doc = new BoardDoc();
    const c = classifyUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    if (c.kind !== "embed") throw new Error("expected embed");
    const id = createEmbed(doc, c, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { x: 0, y: 0 });
    expect(doc.get(id)).toMatchObject({ type: "embed", provider: "youtube", w: 480, h: 270, embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    const s = classifyUrl("https://youtube.com/shorts/dQw4w9WgXcQ");
    if (s.kind !== "embed") throw new Error("expected embed");
    const sid = createEmbed(doc, s, "https://youtube.com/shorts/dQw4w9WgXcQ", { x: 0, y: 0 });
    const e = doc.get(sid) as EmbedObj;
    expect(e.h).toBe(480);
    expect(e.w).toBe(270);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Paste routing

import { insertPaste, MAX_PASTED_URLS, parseClipboard } from "@/lib/engine/clipboard/parse";
import { richContentToJSON } from "@/lib/engine/clipboard/rich";

describe("parseClipboard: URL routing", () => {
  it("a lone URL is a url item; trailing whitespace and a newline are fine", () => {
    expect(parseClipboard({ text: "https://example.com/a" })).toEqual([{ kind: "url", url: "https://example.com/a" }]);
    expect(parseClipboard({ text: "\n  https://youtu.be/dQw4w9WgXcQ  \n" })).toEqual([{ kind: "url", url: "https://youtu.be/dQw4w9WgXcQ" }]);
  });
  it("a URL inside prose stays text", () => {
    expect(parseClipboard({ text: "look at https://example.com/a it is nice" })[0].kind).toBe("text");
    expect(parseClipboard({ text: "https://example.com/a\nand then some words" })[0].kind).toBe("text");
  });
  it("several lines that are each a URL become several url items", () => {
    const items = parseClipboard({ text: "https://a.example.com/1\nhttps://b.example.com/2\r\n\nhttps://youtu.be/dQw4w9WgXcQ\n" });
    expect(items.map((i) => (i.kind === "url" ? i.url : i.kind))).toEqual(["https://a.example.com/1", "https://b.example.com/2", "https://youtu.be/dQw4w9WgXcQ"]);
  });
  it("too many URL lines stay one text object", () => {
    const text = Array.from({ length: MAX_PASTED_URLS + 1 }, (_, i) => `https://example.com/${i}`).join("\n");
    expect(parseClipboard({ text })).toHaveLength(1);
    expect(parseClipboard({ text })[0].kind).toBe("text");
  });
  it("a mix of URL lines and a non-URL line stays text", () => {
    expect(parseClipboard({ text: "https://a.example.com/1\nnot a url" })[0].kind).toBe("text");
  });
  it("file://, javascript:, data: and credentials are text, never a card", () => {
    for (const t of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,<script>1</script>", "https://user:pw@example.com/", "ftp://example.com/x", "C:\\Users\\me\\a.png"]) {
      expect(parseClipboard({ text: t })[0].kind, t).toBe("text");
    }
  });
  it("a 2,000+ character URL is not turned into a card", () => {
    const long = `https://example.com/${"a".repeat(2100)}`;
    expect(parseClipboard({ text: long })[0].kind).toBe("text");
    const ok = `https://example.com/${"a".repeat(1900)}`;
    expect(parseClipboard({ text: ok })[0].kind).toBe("url");
  });
});

describe("insertPaste: URL routing", () => {
  it("a YouTube URL becomes an embed, another URL a link card with the preview deps", async () => {
    const t = setup();
    const ids = insertPaste(t.doc, [{ kind: "url", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, { kind: "url", url: "https://example.com" }], { x: 0, y: 0 }, { links: t.deps });
    const [a, b] = ids.map((id) => t.doc.get(id)!);
    expect(a.type).toBe("embed");
    expect(b.type).toBe("link");
    await previewSettled(t.doc, ids[1]);
    expect(link(t.doc, ids[1]).status).toBe("ready");
    expect(t.deps.fetchPreview).toHaveBeenCalledTimes(1);
  });

  it("without preview deps a URL becomes a plain domain card (no fetch)", () => {
    const doc = new BoardDoc();
    const [id] = insertPaste(doc, [{ kind: "url", url: "https://example.com/x" }], { x: 100, y: 100 });
    expect(link(doc, id)).toMatchObject({ status: "ready", title: "example.com", url: "https://example.com/x" });
  });

  it("Mod+Shift+V (urlAsText) keeps the text object with a link mark, even for a YouTube URL", () => {
    const doc = new BoardDoc();
    const [id] = insertPaste(doc, [{ kind: "url", url: "https://youtu.be/dQw4w9WgXcQ" }], { x: 0, y: 0 }, { urlAsText: true });
    expect(doc.get(id)!.type).toBe("text");
    expect(richContentToJSON(doc.content(id)!).content![0].content![0].marks).toEqual([{ type: "link", attrs: { href: "https://youtu.be/dQw4w9WgXcQ" } }]);
  });

  it("five URLs make five cards in a grid that is centred on the paste point and does not overlap", async () => {
    const t = setup({ fetchPreview: vi.fn(async () => ({ ...PREVIEW, imageUrl: null })) });
    const items = Array.from({ length: 5 }, (_, i) => ({ kind: "url" as const, url: `https://example.com/${i}` }));
    const ids = insertPaste(t.doc, items, { x: 1000, y: 1000 }, { links: t.deps });
    const cards = ids.map((id) => link(t.doc, id));
    expect(cards).toHaveLength(5);
    expect(cards.every((c) => c.type === "link")).toBe(true);
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i];
        const b = cards[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${i} vs ${j}`).toBe(false);
      }
    const minX = Math.min(...cards.map((c) => c.x));
    const maxX = Math.max(...cards.map((c) => c.x + c.w));
    expect((minX + maxX) / 2).toBeCloseTo(1000);
    await Promise.all(ids.map((id) => previewSettled(t.doc, id)));
  });

  it("five pasted URLs never have more than two preview fetches in flight", async () => {
    const t = setup();
    let active = 0;
    let peak = 0;
    t.deps.fetchPreview.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { ...PREVIEW, imageUrl: null };
    });
    const items = Array.from({ length: 5 }, (_, i) => ({ kind: "url" as const, url: `https://example.com/p${i}` }));
    const ids = insertPaste(t.doc, items, { x: 0, y: 0 }, { links: t.deps });
    await Promise.all(ids.map((id) => previewSettled(t.doc, id)));
    expect(peak).toBeLessThanOrEqual(2);
    expect(t.deps.fetchPreview).toHaveBeenCalledTimes(5);
  });

  it("the whole paste is one undo step", () => {
    const doc = new BoardDoc();
    doc.stopCapturing();
    insertPaste(doc, [{ kind: "url", url: "https://example.com/a" }, { kind: "url", url: "https://youtu.be/dQw4w9WgXcQ" }], { x: 0, y: 0 });
    expect(doc.all()).toHaveLength(2);
    doc.undo();
    expect(doc.all()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Copy and paste of cards, and the browser-side fetchers

import { serializeSelection } from "@/lib/engine/clipboard/serialize";
import { fetchLinkImage, fetchLinkPreview } from "@/lib/engine/links/preview-client";

describe("copying link cards and embeds", () => {
  it("copies the address as the readable text, and the card survives a paste into another board", () => {
    const doc = new BoardDoc();
    const a = createPlainLinkCard(doc, "https://example.com/a", { x: 0, y: 0 });
    const c = classifyUrl("https://youtu.be/dQw4w9WgXcQ");
    if (c.kind !== "embed") throw new Error("embed expected");
    const b = createEmbed(doc, c, "https://youtu.be/dQw4w9WgXcQ", { x: 600, y: 0 });
    const { html, text } = serializeSelection(doc, [a, b]);
    expect(text.split("\n")).toEqual(["https://example.com/a", "https://youtu.be/dQw4w9WgXcQ"]);
    const items = parseClipboard({ html, text });
    expect(items[0].kind).toBe("atelier");
    const target = new BoardDoc();
    const ids = insertPaste(target, items, { x: 0, y: 0 });
    expect(ids.map((id) => target.get(id)!.type).sort()).toEqual(["embed", "link"]);
  });

  it("a tampered embed in a clipboard payload is dropped on paste", () => {
    const doc = new BoardDoc();
    const c = classifyUrl("https://youtu.be/dQw4w9WgXcQ");
    if (c.kind !== "embed") throw new Error("embed expected");
    const b = createEmbed(doc, c, "https://youtu.be/dQw4w9WgXcQ", { x: 0, y: 0 });
    const { html } = serializeSelection(doc, [b]);
    const evil = Buffer.from(
      JSON.stringify({ v: 1, objects: [{ ...doc.get(b)!, embedUrl: "https://evil.com/embed/x" }], assets: [] }),
      "utf8",
    ).toString("base64");
    const tampered = html.replace(/<!-- atelier:v1 [^>]*-->/, `<!-- atelier:v1 ${evil} -->`);
    const target = new BoardDoc();
    expect(insertPaste(target, parseClipboard({ html: tampered, text: "" }), { x: 0, y: 0 })).toEqual([]);
  });
});

describe("fetchLinkPreview and fetchLinkImage", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("POSTs the URL and returns the clamped plain-text preview", async () => {
    const f = vi.fn(async () => json({ title: "T".repeat(500), description: "D", siteName: "S", imageUrl: "javascript:alert(1)", faviconUrl: "https://example.com/f.ico", finalUrl: "https://example.com/x" }));
    const p = await fetchLinkPreview("https://example.com/x", f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith("/api/link-preview", expect.objectContaining({ method: "POST", body: JSON.stringify({ url: "https://example.com/x" }) }));
    expect(p.title).toHaveLength(200);
    expect(p.imageUrl).toBeNull();
    expect(p.faviconUrl).toBe("https://example.com/f.ico");
  });

  it("503 (local-only) rejects with LinkPreviewUnavailable; other failures with a plain error", async () => {
    await expect(fetchLinkPreview("https://example.com/x", (async () => json({ error: "local-only" }, 503)) as unknown as typeof fetch)).rejects.toBeInstanceOf(LinkPreviewUnavailable);
    const err = await fetchLinkPreview("https://example.com/x", (async () => json({ error: "blocked" }, 400)) as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(LinkPreviewUnavailable);
  });

  it("fetches the image only through the same-origin proxy and accepts only raster types", async () => {
    const png = new Response(new Blob(["x"], { type: "image/png" }), { status: 200 });
    const f = vi.fn(async () => png);
    const b = await fetchLinkImage("https://cdn.example.com/og.png?a=b&c=d", f as unknown as typeof fetch);
    expect(b.type).toBe("image/png");
    const calledWith = (f.mock.calls[0] as unknown as [string])[0];
    expect(calledWith.startsWith("/api/link-preview/image?url=")).toBe(true);
    expect(decodeURIComponent(calledWith.split("url=")[1])).toBe("https://cdn.example.com/og.png?a=b&c=d");
    await expect(fetchLinkImage("https://x.test/a.svg", (async () => new Response(new Blob(["<svg/>"], { type: "image/svg+xml" }))) as unknown as typeof fetch)).rejects.toThrow();
  });
});
