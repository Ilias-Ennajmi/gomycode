import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { firstFrameName } from "@/lib/engine/model/templates";
import { patchBoard } from "@/lib/sync/board-list-cache";

const PREVIEW_MAX = 4;

/** Up to four distinct image assets for the board's card on the home screen: the largest images (by area) first. */
export function pickPreviewAssets(doc: BoardDoc): string[] {
  const best = new Map<string, number>();
  for (const o of doc.all()) {
    if (o.type !== "image") continue;
    const area = o.w * o.h;
    if (area > (best.get(o.assetId) ?? -1)) best.set(o.assetId, area);
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PREVIEW_MAX)
    .map(([id]) => id);
}

/**
 * What to record when the user leaves a board: when it was opened, the preview images and the first frame's name. The
 * home list on this device is updated first (local-first); signed in, the server hears about it next (`keepalive` so it
 * survives the page closing). Reads the document synchronously, so the caller may destroy it right after calling.
 * Never throws.
 */
export function recordLeave(opts: { boardId: string; doc: BoardDoc; localOnly: boolean; fetchFn?: typeof fetch; now?: number }): Promise<void> {
  const { boardId, doc, localOnly } = opts;
  const lastOpenedAt = new Date(opts.now ?? Date.now()).toISOString();
  let preview: string[] = [];
  let first: string | null = null;
  try {
    preview = pickPreviewAssets(doc);
    first = firstFrameName(doc);
  } catch {
    /* a document in a bad state records only the time */
  }
  const local = patchBoard(boardId, { lastOpenedAt, preview, firstFrameName: first });
  if (localOnly) return local;
  const f = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const remote = (async () => {
    try {
      await f(`/api/boards/${encodeURIComponent(boardId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preview, lastOpenedAt }),
        keepalive: true,
      });
    } catch {
      /* offline: the home screen asks the server again next time */
    }
  })();
  return Promise.all([local, remote]).then(() => undefined);
}
