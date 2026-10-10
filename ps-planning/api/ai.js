// POST /api/ai — vérifie le jeton Firebase du propriétaire puis appelle Gemini. Zéro dépendance.
// Env : GEMINI_API_KEY, GEMINI_MODEL, FIREBASE_API_KEY, OWNER_UID.

const MAX_PROMPT = 12000;
const TIMEOUT_MS = 25000;

const SYSTEM = [
  "Tu travailles pour Planet Sport, distributeur marocain d'articles de sport (30+ magasins, site planetsport.ma). Public : 16 à 35 ans.",
  "Pour tout texte destiné au public : français naturel et direct, lignes courtes empilées, jamais de tiret cadratin, 2 emojis maximum,",
  "« on » plutôt que « nous », aucun mot répété dans une même légende, pas de clichés vendeurs ni sentimentaux.",
  "Un texte promotionnel se termine par « en magasin & sur planetsport.ma ».",
  "Réponds uniquement en JSON valide, sans texte autour.",
].join(" ");

function captionsPrompt(p) {
  const it = (p && p.item) || {};
  return [
    "Écris 3 légendes Instagram pour ce contenu Planet Sport.",
    "Les 3 doivent être structurellement différentes : par exemple une accroche question, une liste courte de bénéfices, une phrase-choc suivie d'un détail produit. Pas trois variantes de la même phrase.",
    "Chaque légende fait 2 à 5 lignes courtes. Pas de hashtags sauf s'ils sont dans les notes.",
    "Si l'intention ou le type est promotionnel, termine par « en magasin & sur planetsport.ma ».",
    "",
    "Contenu :",
    JSON.stringify(it, null, 1),
    "",
    'Format de réponse : {"options":["légende 1","légende 2","légende 3"]}',
  ].join("\n");
}

function reviewPrompt(p) {
  const w = p || {};
  return [
    "Analyse la semaine de publication ci-dessous (posts et stories Instagram) et propose au maximum 5 corrections concrètes.",
    "Vérifie : l'équilibre entre marques par rapport à leurs objectifs (% des slots, tolérance en points), l'équilibre des types de contenu, le minimum de stories par jour, les répétitions d'une même marque le même jour ou deux jours de suite, les jours vides ou surchargés.",
    "Chaque correction est un échange précis et faisable, du style : « Mardi : 3 stories Asics, passe la 2e sur New Balance ».",
    "Ne propose rien d'inutile : si la semaine est équilibrée, renvoie moins de 5 suggestions, voire aucune.",
    "Écris issue et fix en français, une phrase courte chacun. date au format AAAA-MM-JJ.",
    "",
    "Données :",
    JSON.stringify(w),
    "",
    'Format de réponse : {"suggestions":[{"date":"AAAA-MM-JJ","issue":"…","fix":"…"}]}',
  ].join("\n");
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function verifyOwner(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(process.env.FIREBASE_API_KEY),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: m[1] }) }
  );
  if (!r.ok) return false;
  const j = await r.json().catch(() => null);
  return !!(j && j.users && j.users[0] && j.users[0].localId === process.env.OWNER_UID);
}

function parseLoose(t) {
  try { return JSON.parse(t); } catch (e) {}
  const m = String(t).match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
  return undefined;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return null; } }
  let raw = "";
  for await (const c of req) raw += c;
  try { return JSON.parse(raw || "{}"); } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { code: "method_not_allowed" }); }
  if (!/^Bearer\s+\S/i.test(req.headers.authorization || "")) return send(res, 401, { code: "unauthorized" });
  const { GEMINI_API_KEY, GEMINI_MODEL, FIREBASE_API_KEY, OWNER_UID } = process.env;
  if (!FIREBASE_API_KEY || !OWNER_UID) return send(res, 500, { code: "missing_env" });

  let ok = false;
  try { ok = await verifyOwner(req); } catch (e) { ok = false; }
  if (!ok) return send(res, 401, { code: "unauthorized" });
  if (!GEMINI_API_KEY || !GEMINI_MODEL) return send(res, 500, { code: "missing_env" });

  const body = await readBody(req);
  if (!body) return send(res, 400, { code: "bad_request" });
  let prompt;
  if (body.mode === "json") prompt = String(body.prompt || "");
  else if (body.mode === "captions") prompt = captionsPrompt(body);
  else if (body.mode === "review") prompt = reviewPrompt(body);
  else return send(res, 400, { code: "bad_mode" });
  if (!prompt.trim()) return send(res, 400, { code: "bad_request" });
  prompt = prompt.slice(0, MAX_PROMPT);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(GEMINI_MODEL) + ":generateContent",
      {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
        }),
      }
    );
  } catch (e) {
    clearTimeout(timer);
    return send(res, 504, { code: e && e.name === "AbortError" ? "timeout" : "ai_error" });
  }
  clearTimeout(timer);
  if (r.status === 429) return send(res, 429, { code: "rate_limited" });
  if (!r.ok) return send(res, 502, { code: "ai_error", status: r.status });

  const j = await r.json().catch(() => null);
  const parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const text = parts ? parts.map((p) => p.text || "").join("") : "";
  const out = parseLoose(text);
  if (out === undefined) return send(res, 502, { code: "invalid_json" });

  if (body.mode === "captions") {
    const o = out && Array.isArray(out.options) ? out.options.filter((s) => typeof s === "string" && s.trim()) : [];
    if (o.length < 3) return send(res, 502, { code: "invalid_json" });
    return send(res, 200, { options: o.slice(0, 3) });
  }
  if (body.mode === "review") {
    const s = out && Array.isArray(out.suggestions) ? out.suggestions : [];
    return send(res, 200, {
      suggestions: s.filter((x) => x && x.issue && x.fix).slice(0, 5)
        .map((x) => ({ date: String(x.date || ""), issue: String(x.issue), fix: String(x.fix) })),
    });
  }
  return send(res, 200, out);
};
