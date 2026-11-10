// stash-recovery: "move to a new phone" without an email or a password. Contract 0007 §4.3.
//
// create  (needs the device's session): makes a 20-character code, gives the user a synthetic
//         email + a password derived from the code, stores only a hash of the code as lookup id.
//         Calling it again rotates: the old code stops working. The password change ends the
//         user's sessions, so the answer carries a fresh session for this phone next to the code.
// restore (no session): code → lookup id → user → password sign-in → a session for the new phone.
//
// The code and the password are never stored and never logged. Wrong codes all get the same
// 404, and attempts are counted per IP (restore) and per user (create).

import { bearer, CORS, fail, HttpError, json, logFailure, readJson, sha256Hex } from "../_shared/http.ts";
import { derive, formatCode, generateCode, normalizeCode } from "../_shared/recovery_code.ts";

export type Session = { access_token: string; refresh_token: string; expires_at: number | null; user_id: string };

export type Deps = {
  /** The user behind a live access token (asks Auth), else null. */
  userId(token: string): Promise<string | null>;
  rateLimitTake(subject: string, bucket: string, max: number, windowS: number): Promise<boolean>;
  /** auth.admin.updateUserById(uid, {email, password, email_confirm: true}). False when Auth refuses. */
  setCredentials(uid: string, email: string, password: string): Promise<boolean>;
  recoverySet(uid: string, lookup: string): Promise<void>;
  recoveryFind(lookup: string): Promise<string | null>;
  /** The email stored for a user (auth.admin.getUserById), else null. */
  emailOf(uid: string): Promise<string | null>;
  /** signInWithPassword on a throw-away anon client. Null when the password is wrong. */
  signIn(email: string, password: string): Promise<Session | null>;
  generateCode?: () => string;
  now?: () => Date;
};

/**
 * The caller's address for the restore limit. `cf-connecting-ip` is set by the edge; without it the
 * LAST x-forwarded-for hop is the one our own gateway appended (earlier hops are whatever the
 * caller typed, so they cannot be used to dodge the limit).
 */
export function clientIp(req: Request): string {
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (cf) return cf;
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? "unknown";
}

export function makeHandler(deps: Deps): (req: Request) => Promise<Response> {
  async function create(req: Request): Promise<Response> {
    const token = bearer(req);
    const uid = token ? await deps.userId(token) : null;
    if (!uid) return fail(401, "unauthorized", CORS);
    if (!(await deps.rateLimitTake(`u:${uid}`, "recovery_create", 5, 86400))) return fail(429, "rate_limited", CORS);
    const code = (deps.generateCode ?? generateCode)();
    const { lookup, password, email } = await derive(code);
    if (!(await deps.setCredentials(uid, email, password))) return fail(500, "auth_update_failed", CORS);
    await deps.recoverySet(uid, lookup);
    const createdAt = (deps.now ?? (() => new Date()))().toISOString();
    // Changing the password ends the sessions this user had (this phone's included), so sign in
    // again right here and hand the phone a fresh session together with the code. If the sign-in
    // fails the code is still returned: it is then the way back in.
    let session: Session | null = null;
    try {
      session = await deps.signIn(email, password);
      if (session && session.user_id !== uid) session = null;
    } catch {
      session = null;
    }
    return json({
      code: formatCode(code),
      created_at: createdAt,
      access_token: session?.access_token ?? null,
      refresh_token: session?.refresh_token ?? null,
      expires_at: session?.expires_at ?? null,
    }, 200, CORS);
  }

  async function restore(req: Request, body: Record<string, unknown>): Promise<Response> {
    const subject = "ip:" + (await sha256Hex(clientIp(req))).slice(0, 32);
    if (!(await deps.rateLimitTake(subject, "recovery_restore", 10, 3600))) return fail(429, "rate_limited", CORS);
    // All callers together: guesses spread over many addresses are still slow.
    if (!(await deps.rateLimitTake("all", "recovery_restore_all", 600, 3600))) return fail(429, "rate_limited", CORS);
    const norm = normalizeCode(body.code);
    if (!norm) return fail(400, "invalid_code", CORS);
    const { lookup, password } = await derive(norm);
    const uid = await deps.recoveryFind(lookup);
    if (!uid) return fail(404, "not_found", CORS);
    const email = await deps.emailOf(uid);
    const session = email ? await deps.signIn(email, password) : null;
    if (!session || session.user_id !== uid) return fail(404, "not_found", CORS);
    return json(session, 200, CORS);
  }

  return async (req: Request): Promise<Response> => {
    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (req.method !== "POST") return fail(405, "method_not_allowed", CORS);
      const body = await readJson(req, 4 * 1024);
      if (body.action === "create") return await create(req);
      if (body.action === "restore") return await restore(req, body);
      return fail(400, "bad_request", CORS);
    } catch (e) {
      logFailure("stash-recovery", e);
      return e instanceof HttpError ? fail(e.status, e.code, CORS) : fail(500, "internal", CORS);
    }
  };
}
