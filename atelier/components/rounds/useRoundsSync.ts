"use client";

import { useMemo } from "react";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { pushLocalState } from "@/lib/engine/rounds/client";
import type { BoardInfo } from "./BoardInfo";

/**
 * How the server's copy of the board is brought up to date before a round, a safety snapshot or a restore: the sync client's
 * flush (and its status afterwards), or, in local-only mode where nothing syncs, a hand-over of the whole current state.
 */
export function useRoundsSync(info: BoardInfo | null, doc: BoardDoc): { flush(): Promise<void>; readonly status?: string } | null {
  return useMemo(() => {
    if (!info) return null;
    if (info.localOnly || !info.sync) return { flush: () => pushLocalState(info.boardId, doc.ydoc, doc.meta.title) };
    const s = info.sync;
    return {
      flush: () => s.flush(),
      get status() {
        return s.status;
      },
    };
  }, [info, doc]);
}
