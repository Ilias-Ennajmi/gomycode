// Smoke test. Usage: node scripts/smoke.mjs <base-url>. Prints PASS/FAIL per check.
import { env, signIn, getDoc, setDoc, deleteDoc, countCollection } from "./firestore-rest.mjs";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE) { console.log("usage: node scripts/smoke.mjs <base-url>"); process.exit(2); }
let fails = 0;
const report = (n, ok, why = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${why ? " (" + why + ")" : ""}`); };
const fbReady = env.FIREBASE_API_KEY && env.FIREBASE_PROJECT_ID && env.OWNER_EMAIL && env.APP_PASSWORD;
let tok = null;
async function token() { if (!tok) tok = (await signIn()).idToken; return tok; }
async function check(n, fn) { try { const r = await fn(); report(n, r === true, r === true ? "" : String(r)); } catch (e) { report(n, false, e.message); } }

await check("1. / renvoie 200 avec le titre", async () => {
  const r = await fetch(BASE + "/"); const t = await r.text();
  return r.status === 200 && t.includes("Planning Éditorial Planet Sport") ? true : "status " + r.status;
});
await check("2. SETUP.env, seed, reference introuvables (404)", async () => {
  const st = [];
  for (const p of ["/SETUP.env", "/seed/seed.json", "/reference/planning-editorial.html"]) st.push((await fetch(BASE + p)).status);
  return st.every((s) => s === 404) ? true : st.join(",");
});
await check("3. /api/ai sans jeton → 401", async () => {
  const r = await fetch(BASE + "/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"mode":"captions"}' });
  return r.status === 401 ? true : "status " + r.status;
});
await check("4. Connexion REST + écriture/lecture/suppression days/_smoke", async () => {
  if (!fbReady) return "SETUP.env incomplet";
  const t = await token(), v = { date: "_smoke", posts: [[1, "nested"]], stories: [] };
  await setDoc("days/_smoke", v, t);
  const back = await getDoc("days/_smoke", t);
  await deleteDoc("days/_smoke", t);
  const gone = await getDoc("days/_smoke", t);
  return JSON.stringify(back.data) === JSON.stringify(v) && gone.status === 404 ? true : "relecture incorrecte";
});
await check("5. Lecture Firestore anonyme de config/settings refusée", async () => {
  if (!fbReady) return "SETUP.env incomplet";
  const r = await getDoc("config/settings", null);
  return r.status === 403 || r.status === 401 ? true : "status " + r.status;
});
await check("6. /api/ai captions avec jeton → 3 propositions", async () => {
  if (!fbReady) return "SETUP.env incomplet";
  const r = await fetch(BASE + "/api/ai", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) },
    body: JSON.stringify({ mode: "captions", item: { marque: "Asics", format: "Reel", slot: "Post", titre: "Novablast 5 : test terrain", notes: "", campagne: "", intention: "Faire cliquer" } }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok && Array.isArray(j.options) && j.options.length === 3 ? true : "status " + r.status + " " + (j.code || "");
});
await check("7. Données importées (days ≥ 20, campaigns ≥ 2, config = 2)", async () => {
  if (!fbReady) return "SETUP.env incomplet";
  const t = await token();
  const [d, c, k] = await Promise.all(["days", "campaigns", "config"].map((n) => countCollection(n, t)));
  return d >= 20 && c >= 2 && k === 2 ? true : `days ${d}, campaigns ${c}, config ${k}`;
});
console.log(fails ? `${fails} FAIL` : "ALL PASS");
process.exit(fails ? 1 : 0);
