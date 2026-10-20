import { NextRequest, NextResponse } from "next/server";
import { parseHTML } from "linkedom";
import { prisma } from "@/lib/prisma";
import { cleanHtml } from "@/lib/clean-html";
import { zipStore } from "@/lib/zip";

export const dynamic = "force-dynamic";

// Later as a book: every article in the queue (or one collection with ?collection=) as an
// EPUB 3 for an e-reader. Text only; pictures stay on the web, which keeps the file small
// and the reader honest about what it has offline.

const MAX_ARTICLES = 60;

function esc(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML into well-formed XHTML, as EPUB readers want it. */
function toXhtml(html: string) {
  const { document } = parseHTML(`<!doctype html><html><body><div>${html}</div></body></html>`);
  const root = document.body.firstElementChild;
  if (!root) return "";
  for (const el of Array.from(
    root.querySelectorAll(
      "img, picture, source, iframe, video, audio, svg, script, style, form, button, input"
    )
  ))
    el.remove();
  // Attributes an EPUB validator rejects.
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (!["href", "title", "lang", "id"].includes(attr.name)) el.removeAttribute(attr.name);
    }
  }
  // linkedom serialises as XML-ish HTML; void elements must self-close for XHTML.
  return root.innerHTML
    .replace(/<(br|hr|wbr)([^>]*?)(?<!\/)>/g, "<$1$2 />")
    .replace(/&nbsp;/g, "&#160;")
    .replace(/&(?![a-z#0-9]+;)/gi, "&amp;");
}

function chapter(title: string, byline: string, body: string, link: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<section epub:type="chapter">
<h1>${esc(title)}</h1>
<p class="byline">${esc(byline)} · <a href="${esc(link)}">Original</a></p>
${body}
</section>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const collectionId = request.nextUrl.searchParams.get("collection");
  const where = collectionId
    ? { collections: { some: { collectionId } } }
    : { isSaved: true, archivedAt: null };
  const [articles, collection] = await Promise.all([
    prisma.article.findMany({
      where: { ...where, isVideo: false, audioUrl: null },
      orderBy: collectionId ? { publishedAt: "desc" } : { savedAt: "desc" },
      take: MAX_ARTICLES,
      select: {
        id: true,
        title: true,
        link: true,
        author: true,
        publishedAt: true,
        summary: true,
        content: true,
        fullContent: true,
        feed: { select: { title: true } },
      },
    }),
    collectionId
      ? prisma.collection.findUnique({ where: { id: collectionId }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  if (articles.length === 0) {
    return NextResponse.json({ error: "Nothing to put in the book yet" }, { status: 404 });
  }

  const title = collection?.name ?? "Reader · Later";
  const date = new Date();
  const stamp = date.toISOString().slice(0, 10);
  const uid = `urn:uuid:${crypto.randomUUID()}`;

  const chapters = articles.map((article, i) => {
    const raw = article.fullContent || article.content || article.summary || "";
    const body = toXhtml(cleanHtml(raw) ?? raw) || "<p>No text was kept for this article.</p>";
    const byline = [article.author, article.feed.title, article.publishedAt.toDateString()]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `c${i + 1}`,
      file: `c${i + 1}.xhtml`,
      title: article.title,
      xhtml: chapter(article.title, byline, body, article.link),
    };
  });

  const manifest = chapters
    .map((c) => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const spine = chapters.map((c) => `<itemref idref="${c.id}"/>`).join("\n    ");
  const navItems = chapters
    .map((c) => `<li><a href="${c.file}">${esc(c.title)}</a></li>`)
    .join("\n      ");

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${esc(title)} · ${stamp}</dc:title>
    <dc:creator>Reader</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${date.toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${manifest}
  </manifest>
  <spine>
    <itemref idref="nav"/>
    ${spine}
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>${esc(title)}</h1>
  <p class="byline">${articles.length} articles · made ${stamp}</p>
  <ol>
      ${navItems}
  </ol>
</nav>
</body>
</html>`;

  const css = `body{font-family:Georgia,serif;line-height:1.55;margin:1em}
h1{font-size:1.5em;line-height:1.2}
.byline{color:#666;font-size:.85em}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #ccc}
pre,code{font-family:monospace;font-size:.9em;white-space:pre-wrap}`;

  const zip = zipStore([
    { name: "mimetype", data: "application/epub+zip" },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    },
    { name: "OEBPS/content.opf", data: opf },
    { name: "OEBPS/nav.xhtml", data: nav },
    { name: "OEBPS/style.css", data: css },
    ...chapters.map((c) => ({ name: `OEBPS/${c.file}`, data: c.xhtml })),
  ]);

  const filename = `${title.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "reader"}-${stamp}.epub`;
  return new NextResponse(new Blob([zip as BlobPart]), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
