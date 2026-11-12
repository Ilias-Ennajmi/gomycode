import { MemoryShareStore } from "@/lib/server/share-store-memory";
import type { NewLink, Visitor } from "@/lib/server/share-store";
import { COOKIE_TTL_SEC, signVisitorCookie, visitorCookieName, type VisitorClaims } from "@/lib/share/cookie";
import type { LinkRow } from "@/lib/share/link";
import { generateToken } from "@/lib/share/token";

export const SECRET = "s".repeat(48);
export const OWNER = "11111111-1111-4111-8111-111111111111";
export const BOARD = "55555555-5555-4555-8555-555555555555";
export const ORIGIN = "https://atelier.example.com";

export interface World {
  store: MemoryShareStore;
  clock: { now: Date };
  nowSec(): number;
  token: string;
  link: LinkRow;
  /** A named visitor on `link`. */
  visitor: Visitor;
  /** The visitor's cookie as a `Cookie` request header value. */
  cookie(over?: Partial<VisitorClaims>, forLink?: LinkRow): string;
  /** A link on the same board with its own token (for cross-link tests). */
  extraLink(over?: Partial<NewLink>): Promise<{ link: LinkRow; token: string }>;
}

/** A board, a link on it, and a named visitor of that link, all in a memory store with a fake clock. */
export async function makeWorld(over: Partial<NewLink> = {}, opts: { named?: boolean } = {}): Promise<World> {
  const clock = { now: new Date("2026-11-12T10:00:00Z") };
  const store = new MemoryShareStore({ now: () => clock.now });
  store.seedBoard({ id: BOARD, ownerId: OWNER, title: "Brand refresh" });
  const base = (tokenHash: string, extra: Partial<NewLink> = {}): NewLink => ({
    boardId: BOARD, ownerId: OWNER, name: "Client", tokenHash, mode: "live", roundId: null, scope: "board", frameIds: [], permission: "comment",
    passwordHash: null, expiresAt: null, welcomeNote: "", allowDownload: false, watermark: false, showCredits: false, blindVotes: false, ...extra,
  });
  const t = generateToken();
  const link = await store.insertLink(base(t.hash, over));
  const visitor = await store.createVisitor(link.id, "iphash");
  if (opts.named !== false) await store.setVisitorName(visitor.id, "Jane");
  const named = (await store.getVisitor(visitor.id))!;
  const nowSec = () => Math.floor(clock.now.getTime() / 1000);
  const world: World = {
    store,
    clock,
    nowSec,
    token: t.token,
    link,
    visitor: named,
    cookie(c = {}, forLink = link) {
      // The epoch is read from the store so a bumped epoch needs an explicit `ep` to stay "old".
      const claims: VisitorClaims = { lid: forLink.id, vid: named.id, ep: forLink.cookieEpoch, pw: true, exp: nowSec() + COOKIE_TTL_SEC, ...c };
      return `${visitorCookieName(forLink.id)}=${signVisitorCookie(claims, SECRET)}`;
    },
    async extraLink(extra = {}) {
      const g = generateToken();
      return { link: await store.insertLink(base(g.hash, extra)), token: g.token };
    },
  };
  return world;
}

export function visitorRequest(path: string, init: { method?: string; body?: unknown; cookie?: string | null; headers?: Record<string, string>; origin?: string | null } = {}): Request {
  const headers: Record<string, string> = { ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  const method = init.method ?? "GET";
  if (method !== "GET") {
    headers["content-type"] ??= "application/json";
    if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  }
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

/** Runs `p` and returns the Response it threw (fails the test if it did not throw one). */
export async function thrownResponse(p: Promise<unknown>): Promise<Response> {
  try {
    await p;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  throw new Error("expected a Response to be thrown");
}

/** The set-cookie header's `name=value` part. */
export function cookiePair(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  return raw ? raw.split(";")[0] : null;
}
