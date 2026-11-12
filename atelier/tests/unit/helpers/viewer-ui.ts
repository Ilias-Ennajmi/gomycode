import { buildViewerBoard } from "@/lib/server/viewer-board";
import { EMPTY_ROUND_DIFF, type Round } from "@/lib/share/round-types";
import type { SharePageData } from "@/lib/viewer/page-data";
import type { ViewerApi } from "@/lib/viewer/viewer-client";
import type { ViewerBoard } from "@/lib/viewer/viewer-types";
import { vi } from "vitest";
import { A1, A2, assetRow, makeFixture, type Fixture } from "./viewer-fixture";
import { makeWorld } from "./share-world";
import type { NewLink } from "@/lib/server/share-store";

export const BASE = "https://assets.example.com";

/** A real ViewerBoard (built by the server's builder) of the standard fixture, with previews for frame A when `previews`. */
export async function makeBoard(over: Partial<NewLink> = {}, opts: { previews?: boolean; mutate?: (fx: Fixture) => void } = {}): Promise<{ board: ViewerBoard; fx: Fixture }> {
  const fx = makeFixture();
  opts.mutate?.(fx);
  const w = await makeWorld(over);
  const round: Round | null = opts.previews
    ? {
        id: "00000001-0000-4000-8000-000000000000", boardId: w.link.boardId, number: 2, label: "Round 2", snapshotId: "s", diff: { ...EMPTY_ROUND_DIFF }, publishedAt: "2026-11-10T00:00:00Z",
        previews: {
          [fx.ids.frameA]: { w480: `p/tok/${fx.ids.frameA}-w480.webp`, w1280: `p/tok/${fx.ids.frameA}-w1280.webp`, w: 800, h: 600 },
          [fx.ids.frameB]: { w480: `p/tok/${fx.ids.frameB}-w480.webp`, w1280: `p/tok/${fx.ids.frameB}-w1280.webp`, w: 800, h: 600 },
        },
      }
    : null;
  const board = buildViewerBoard({
    state: fx.state, link: w.link, round, title: "Brand refresh", assets: [assetRow(A1), assetRow(A2)], visitor: { id: "v1", displayName: "Jane" },
    diffsSinceLastView: [], sinceRound: null, assetBase: BASE,
  });
  return { board, fx };
}

export const ready = (board: ViewerBoard, extra: Partial<Extract<SharePageData, { kind: "ready" }>> = {}): SharePageData => ({
  kind: "ready", studioName: "Studio Nord", linkKey: "abcdef123456", hasSession: true, visitorName: "Jane", title: board.board.title, board, ...extra,
});

export function fakeApi(over: Partial<ViewerApi> = {}): ViewerApi {
  return {
    session: vi.fn(async () => ({ ok: true as const, name: null })),
    unlock: vi.fn(async () => ({ ok: true as const })),
    join: vi.fn(async (name: string) => ({ name })),
    board: vi.fn(async () => {
      throw new Error("board() not expected");
    }),
    json: vi.fn(async () => {
      throw new Error("json() not expected");
    }),
    ...over,
  };
}
