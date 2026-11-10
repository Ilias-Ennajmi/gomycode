/*
 * The device's anonymous identity, created by the phone itself (never by the server).
 *
 * Phase 0–3 created it in proxy.ts on the first GET, so every link preview and
 * crawler that opened a page got an auth user. Now the first page whose JavaScript
 * actually runs asks for one, once, and every data path waits for it.
 *
 * Pure and dependency-free so it can be unit-tested with a fake auth client.
 */

export type MinimalSession = { access_token: string; user: { id: string } };

export type SessionAuth<S extends MinimalSession = MinimalSession> = {
  getSession: () => Promise<{ data: { session: S | null } }>;
  signInAnonymously: () => Promise<{ data: { session: S | null }; error: unknown }>;
};

export type GateOptions = {
  /** Pages that must never create an identity (design board, shared collections). */
  isPublicPage?: () => boolean;
  /** Crawlers and preview renderers that run JavaScript. */
  isBot?: () => boolean;
  isOnline?: () => boolean;
  now?: () => number;
  /** After a failed sign-in (offline, anonymous sign-ins off), wait this long before trying again. */
  retryMs?: number;
  /** Called once when a new identity was created (the app refreshes server-rendered parts). */
  onCreated?: () => void;
};

/** Paths that never get an identity. Same list proxy.ts used to skip. */
export const PUBLIC_PREFIXES = ["/design", "/offline", "/api/cron", "/c"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const BOT_RE = /bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|embedly|whatsapp|telegram/i;

export function isBotAgent(ua: string | null | undefined, webdriver = false): boolean {
  return webdriver || BOT_RE.test(ua ?? "");
}

/**
 * Returns ensureSession(): resolves to the session, creating an anonymous one if
 * there is none. Concurrent callers (React StrictMode runs effects twice, several
 * loaders start together) share one in-flight call, so at most one sign-in happens.
 */
export function createSessionGate<S extends MinimalSession>(getAuth: () => SessionAuth<S> | null, opts: GateOptions = {}) {
  const now = opts.now ?? (() => Date.now());
  const retryMs = opts.retryMs ?? 30_000;
  let inFlight: Promise<S | null> | null = null;
  let lastFailure = -Infinity;

  return function ensureSession(): Promise<S | null> {
    const auth = getAuth();
    if (!auth) return Promise.resolve(null);
    inFlight ??= (async () => {
      try {
        const { data } = await auth.getSession();
        if (data.session) return data.session;
        if (opts.isPublicPage?.() || opts.isBot?.()) return null;
        if (opts.isOnline && !opts.isOnline()) return null;
        if (now() - lastFailure < retryMs) return null;
        const { data: signed, error } = await auth.signInAnonymously();
        if (error || !signed.session) {
          lastFailure = now();
          return null;
        }
        opts.onCreated?.();
        return signed.session;
      } catch {
        lastFailure = now();
        return null;
      }
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

/**
 * Supabase data requests (REST, Storage, Functions) made before the identity exists
 * would go out with the publishable key only and come back empty or 401. This wraps
 * fetch so they wait for ensureSession() and then carry the new access token.
 * Auth requests pass straight through (the gate itself uses them).
 */
export function sessionAwareFetch<S extends MinimalSession>(
  ensureSession: () => Promise<S | null>,
  anonKey: string,
  base: typeof fetch = (...a) => fetch(...a),
): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/\/(rest|storage|functions)\/v1\//.test(url)) return base(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const auth = headers.get("Authorization") ?? "";
    if (auth === `Bearer ${anonKey}` || auth === "") {
      const session = await ensureSession();
      if (session) headers.set("Authorization", `Bearer ${session.access_token}`);
    }
    return base(input, { ...init, headers });
  };
}
