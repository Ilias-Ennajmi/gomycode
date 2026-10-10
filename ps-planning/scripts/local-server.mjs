// Local stand-in for `vercel dev` when the CLI isn't logged in: serves public/ and runs api/ai.js.
// Usage: node scripts/local-server.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { createRequire } from "node:module";
import { ROOT, loadEnv } from "./env.mjs";

Object.assign(process.env, loadEnv(), process.env);
const handler = createRequire(import.meta.url)(join(ROOT, "api/ai.js"));
const PUB = join(ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const port = +process.argv[2] || 3000;
createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/api/ai") return handler(req, res);
  const file = normalize(join(PUB, path === "/" ? "index.html" : path));
  if (!file.startsWith(PUB)) { res.statusCode = 404; return res.end(); }
  try { const b = await readFile(file); res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream"); res.end(b); }
  catch { res.statusCode = 404; res.end("Not found"); }
}).listen(port, () => console.log("http://localhost:" + port));
