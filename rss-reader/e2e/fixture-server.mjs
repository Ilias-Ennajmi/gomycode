// The outside world, for end-to-end tests: silent audio of any length (with Range, like a
// podcast host), a cover picture, and small RSS feeds. No network, no binary fixtures.
//   node e2e/fixture-server.mjs [port]
import http from "node:http";

const port = Number(process.argv[2] ?? process.env.FIXTURE_PORT ?? 3101);
const base = `http://localhost:${port}`;

/** A mono 8 kHz 8-bit WAV of silence, `seconds` long. */
function silentWav(seconds) {
  const rate = 8000;
  const samples = Math.max(1, Math.round(seconds * rate));
  const buffer = Buffer.alloc(44 + samples, 128);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples, 40);
  return buffer;
}
const wavCache = new Map();

// A 1×1 purple PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN0aPhfDwAFAQJ/0aD4WQAAAABJRU5ErkJggg==",
  "base64"
);

function podcastFeed(title) {
  const items = [1, 2, 3, 4, 5, 6]
    .map(
      (n) => `<item><title>${title} episode ${n}</title><guid>${title}-${n}</guid>
<pubDate>${new Date(Date.now() - n * 86400000).toUTCString()}</pubDate>
<enclosure url="${base}/audio/${60 * n}.wav" type="audio/wav" length="1"/>
<itunes:duration>${60 * n}</itunes:duration><description>Notes for episode ${n}.</description></item>`
    )
    .join("\n");
  return `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>${title}</title><link>${base}/</link><language>en</language>
<description>A show made for tests. It talks about sleep, focus and memory, at length, so the preview has a description long enough to fold behind "see more" on a phone screen. ${"More words. ".repeat(30)}</description>
<itunes:image href="${base}/art.png"/>${items}</channel></rss>`;
}

function emptyFeed(title) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><link>${base}/</link></channel></rss>`;
}

function send(res, status, type, body, extra = {}) {
  // The "plain" audio is a show whose server doesn't allow pages to read it (no CORS).
  const cors = extra.noCors ? {} : { "Access-Control-Allow-Origin": "*" };
  delete extra.noCors;
  res.writeHead(status, { "Content-Type": type, ...cors, ...extra });
  res.end(body);
}

// Stand-ins for Readwise and Notion: they check the token, keep what they're sent, and
// /_received hands it to the test.
const received = [];
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data ? JSON.parse(data) : null));
  });

async function exportApis(req, res, url) {
  const auth = req.headers.authorization ?? "";
  const json = (status, body) => send(res, status, "application/json", JSON.stringify(body));
  if (url.pathname.startsWith("/readwise/")) {
    if (auth !== "Token good-readwise") return json(401, { detail: "Invalid token" });
    if (url.pathname === "/readwise/auth/") return send(res, 204, "text/plain", "");
    if (url.pathname === "/readwise/highlights/" && req.method === "POST") {
      received.push({ service: "readwise", body: await readBody(req) });
      return json(200, []);
    }
  }
  if (url.pathname.startsWith("/notion/")) {
    if (auth !== "Bearer good-notion") return json(401, { message: "API token is invalid." });
    if (/^\/notion\/databases\/[0-9a-f]{32}$/.test(url.pathname)) {
      return json(200, {
        properties: { Title: { type: "title" }, Tags: { type: "multi_select" } },
      });
    }
    if (url.pathname === "/notion/pages" && req.method === "POST") {
      received.push({ service: "notion", body: await readBody(req) });
      return json(200, { id: `page-${received.length}` });
    }
    const children = url.pathname.match(/^\/notion\/blocks\/([\w-]+)\/children$/);
    if (children && req.method === "PATCH") {
      received.push({ service: "notion-append", page: children[1], body: await readBody(req) });
      return json(200, {});
    }
  }
  if (url.pathname === "/_received") return json(200, received);
  return false;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, base);
    if ((await exportApis(req, res, url)) !== false) return;
    const audio = url.pathname.match(/^\/audio(-plain)?\/(\d+)\.wav$/);
    if (audio) {
      const seconds = Number(audio[2]);
      const noCors = Boolean(audio[1]);
      if (!wavCache.has(seconds)) wavCache.set(seconds, silentWav(seconds));
      const body = wavCache.get(seconds);
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        return send(res, 206, "audio/wav", body.subarray(start, end + 1), {
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${body.length}`,
          "Content-Length": String(end - start + 1),
          noCors,
        });
      }
      return send(res, 200, "audio/wav", body, {
        "Accept-Ranges": "bytes",
        "Content-Length": String(body.length),
        noCors,
      });
    }
    if (url.pathname === "/art.png") return send(res, 200, "image/png", PNG);
    const podcast = url.pathname.match(/^\/podcast\/([\w-]+)\.xml$/);
    if (podcast)
      return send(res, 200, "application/rss+xml", podcastFeed(podcast[1].replace(/-/g, " ")));
    const feed = url.pathname.match(/^\/feed\/([\w-]+)\.xml$/);
    if (feed) return send(res, 200, "application/rss+xml", emptyFeed(feed[1].replace(/-/g, " ")));
    if (url.pathname === "/health") return send(res, 200, "text/plain", "ok");
    send(res, 404, "text/plain", "not found");
  })
  .listen(port, () => console.log(`fixtures on ${base}`));
