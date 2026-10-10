// Lists Gemini models once and prints the newest stable Flash model supporting generateContent.
// Usage: node scripts/pick-model.mjs  (reads GEMINI_API_KEY from SETUP.env)
import { loadEnv } from "./env.mjs";
const key = loadEnv().GEMINI_API_KEY;
if (!key) { console.log("GEMINI_API_KEY missing"); process.exit(1); }
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { headers: { "x-goog-api-key": key } });
const j = await r.json();
const ok = (j.models || [])
  .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
  .map((m) => m.name.replace(/^models\//, ""))
  .filter((n) => /^gemini-[\d.]+-flash$/.test(n)); // stable only: no -preview, -exp, -lite, dated suffixes
ok.sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]));
console.log(ok[0] || "none");
