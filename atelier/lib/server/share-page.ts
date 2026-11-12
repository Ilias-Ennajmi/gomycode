import { cookieSecretsFromEnv } from "@/lib/share/cookie";
import { resolveLink, sessionFor, type GuardDeps } from "@/lib/share/guard";
import type { SharePageData } from "@/lib/viewer/page-data";
import type { ViewerBoard } from "@/lib/viewer/viewer-types";
import { cachedLinkState } from "./link-state";
import { getShareStore } from "./share-store";
import { assetBaseFromEnv, buildViewerBoard, exposedAssetIds, loadViewerBoard, ViewerBoardTooLargeError } from "./viewer-board";

/*
 * What the page /s/[token] shows before any script runs. It calls the same library the API routes call (no HTTP hop).
 *
 *   gone      unknown, malformed, revoked, expired, board in the trash, round missing: ONE answer, with nothing else in it
 *   password  the link has a password and this browser has not passed the gate: no title, no board, no preview
 *   ready     the board (redacted by the same builder as the API), so the first slide can be painted from the server's HTML.
 *             A first visit has no cookie yet (a page cannot set one while rendering): the board is built for a stub visitor,
 *             which is exactly what a new session would receive, and the client asks for its session after hydration.
 *   error     the board could not be built (far too many objects)
 */

export type { SharePageData } from "@/lib/viewer/page-data";

export interface SharePageDeps extends GuardDeps {
  assetBase?: string;
  env?: Record<string, string | undefined>;
}

const STUDIO_NAME_MAX = 80;

export async function loadSharePage(req: Request, token: string, deps: SharePageDeps = {}): Promise<SharePageData> {
  const env = deps.env ?? process.env;
  const studioName = (env.ATELIER_STUDIO_NAME ?? "").trim().slice(0, STUDIO_NAME_MAX);
  try {
    const store = deps.store ?? getShareStore();
    const r = await resolveLink(req, token, { ...deps, store, secrets: deps.secrets ?? cookieSecretsFromEnv(env) });
    const session = await sessionFor(r);
    // The same test as `meta`: a cookie with an old epoch (password changed, link revoked and restored) has passed nothing.
    const needsPassword = r.link.passwordHash !== null && !(r.claims?.pw === true && r.claims.ep === r.link.cookieEpoch);
    if (needsPassword) return { kind: "password", studioName, linkKey: r.link.id.slice(0, 12) };

    const assetBase = deps.assetBase ?? assetBaseFromEnv(env);
    const live = session !== null && session !== "password-required" ? session : null;
    let board: ViewerBoard;
    if (live) {
      board = await loadViewerBoard({ store, link: r.link, visitor: live.visitor, assetBase });
    } else {
      const { state, round } = await cachedLinkState(store, r.link);
      const title = r.board.title;
      const assets = await store.getAssets(exposedAssetIds(state, r.link));
      board = buildViewerBoard({ state, link: r.link, round, title, assets, visitor: { id: "", displayName: null }, diffsSinceLastView: [], sinceRound: null, assetBase });
    }
    return { kind: "ready", studioName, linkKey: r.link.id.slice(0, 12), hasSession: live !== null, visitorName: live?.visitor.displayName ?? null, title: r.board.title, board };
  } catch (e) {
    if (e instanceof ViewerBoardTooLargeError) return { kind: "error" };
    if (e instanceof Response) {
      if (e.status === 503) return { kind: "error" }; // a deployment fault, not something about this link
      return { kind: "gone" }; // 404 / 410 / a round that is not this board's: the same screen
    }
    throw e;
  }
}
