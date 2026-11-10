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
  refreshSession?: () => Promise<{ data: { session: S | null }; error: unknown }>;
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
  /** Whether this device already had an identity (a flag kept in localStorage). */
  hadIdentity?: () => boolean;
  /** Remembers that this device has an identity (called with each session found or made). */
  rememberIdentity?: (userId: string) => void;
  /**
   * The device had an identity, its session is gone and couldn't be refreshed, so a new,
   * empty one was made. The app tells the person (it can't be undone from here).
   */
  onReplaced?: () => void;
};

/** localStorage key: set once this device has had an identity. */
export const IDENTITY_FLAG = "stash.identity";

/** Paths that never get an identity. Same list proxy.ts used to skip. */
export const PUBLIC_PREFIXES = ["/design", "/offline", "/api/cron", "/c", "/restore"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Crawlers and link-preview renderers that execute JavaScript announce themselves in the
// user agent. Automated browsers (headless Chrome, webdriver) are NOT treated as bots:
// scripts/e2e-smoke.mjs drives the real app with Playwright and needs an identity.
const BOT_RE = /bot\b|bot\/|crawl|spider|slurp|lighthouse|facebookexternalhit|embedly|whatsapp|telegram|preview/i;

export function isBotAgent(ua: string | null | undefined): boolean {
  return BOT_RE.test(ua ?? "");
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
        if (data.session) {
          opts.rememberIdentity?.(data.session.user.id);
          return data.session;
        }
        if (opts.isPublicPage?.() || opts.isBot?.()) return null;
        if (opts.isOnline && !opts.isOnline()) return null;
        if (now() - lastFailure < retryMs) return null;
        // This device had an identity: try to get it back before making a new, empty one.
        const had = opts.hadIdentity?.() ?? false;
        if (had && auth.refreshSession) {
          try {
            const { data: refreshed, error } = await auth.refreshSession();
            if (!error && refreshed.session) {
              opts.rememberIdentity?.(refreshed.session.user.id);
              return refreshed.session;
            }
          } catch {
            // fall through: a new identity keeps the app usable
          }
        }
        const { data: signed, error } = await auth.signInAnonymously();
        if (error || !signed.session) {
          lastFailure = now();
          return null;
        }
        opts.rememberIdentity?.(signed.session.user.id);
        opts.onCreated?.();
        if (had) opts.onReplaced?.();
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
