// Firestore over REST with the app's { j, u } encoding. Signs in as the owner (email + password from SETUP.env).
import { loadEnv } from "./env.mjs";

export const env = loadEnv();

export function base(projectId = env.FIREBASE_PROJECT_ID) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

export async function signIn(email = env.OWNER_EMAIL, password = env.APP_PASSWORD) {
  const r = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(env.FIREBASE_API_KEY),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  const j = await r.json();
  if (!r.ok) throw new Error("sign-in failed: " + (j.error && j.error.message));
  return { idToken: j.idToken, uid: j.localId };
}

const enc = (obj) => ({ fields: { j: { stringValue: JSON.stringify(obj) }, u: { timestampValue: new Date().toISOString() } } });
const dec = (doc) => {
  const f = (doc && doc.fields) || {};
  if (f.j && typeof f.j.stringValue === "string") return JSON.parse(f.j.stringValue);
  return f;
};
const hdr = (token) => (token ? { Authorization: "Bearer " + token, "Content-Type": "application/json" } : { "Content-Type": "application/json" });

// → { status, data } ; data is undefined when the doc does not exist.
export async function getDoc(path, token) {
  const r = await fetch(`${base()}/${path}`, { headers: hdr(token) });
  if (r.status === 404) return { status: 404, data: undefined };
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: r.ok ? dec(j) : undefined };
}

export async function setDoc(path, obj, token) {
  const r = await fetch(`${base()}/${path}`, { method: "PATCH", headers: hdr(token), body: JSON.stringify(enc(obj)) });
  if (!r.ok) throw new Error(`set ${path}: ${r.status} ${await r.text()}`);
}

// Creates only if missing. → true when created, false when it already existed.
export async function createDoc(path, obj, token) {
  const r = await fetch(`${base()}/${path}?currentDocument.exists=false`, { method: "PATCH", headers: hdr(token), body: JSON.stringify(enc(obj)) });
  if (r.ok) return true;
  const t = await r.text();
  if (r.status === 409 || /FAILED_PRECONDITION|ALREADY_EXISTS/.test(t)) return false;
  throw new Error(`create ${path}: ${r.status} ${t}`);
}

export async function deleteDoc(path, token) {
  const r = await fetch(`${base()}/${path}`, { method: "DELETE", headers: hdr(token) });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${path}: ${r.status}`);
}

export async function countCollection(name, token) {
  let n = 0, pageToken = "";
  do {
    const r = await fetch(`${base()}/${name}?pageSize=300&mask.fieldPaths=u${pageToken ? "&pageToken=" + pageToken : ""}`, { headers: hdr(token) });
    const j = await r.json();
    if (!r.ok) throw new Error(`list ${name}: ${r.status}`);
    n += (j.documents || []).length;
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return n;
}
