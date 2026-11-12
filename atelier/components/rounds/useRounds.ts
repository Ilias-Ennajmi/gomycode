"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoundsRequestError, type RoundsClient } from "@/lib/engine/rounds/client";
import type { Round } from "@/lib/share/round-types";

export type LoadStatus = "loading" | "ready" | "needs-server" | "error";

/** Why a load failed, in the two ways the UI cares about: the server is not there (not configured, signed out), or something broke. */
export function statusOfFailure(e: unknown): "needs-server" | "error" {
  return e instanceof RoundsRequestError && (e.status === 503 || e.status === 401 || e.status === 403) ? "needs-server" : "error";
}

/**
 * The board's published rounds, newest first, reloaded on `refresh()`. Each round carries its `diff` (what changed since the
 * round before it) and `publishedAt`: the data the share page's "changed since you last looked" flags and the feedback panel read.
 */
export function useRounds(boardId: string | null, client: Pick<RoundsClient, "listRounds">): { status: LoadStatus; rounds: Round[]; refresh(): void } {
  const [state, setState] = useState<{ status: LoadStatus; rounds: Round[] }>({ status: "loading", rounds: [] });
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!boardId) return;
    const run = ++latest.current;
    void client.listRounds(boardId).then(
      (rounds) => {
        if (run === latest.current) setState({ status: "ready", rounds });
      },
      (e) => {
        if (run === latest.current) setState({ status: statusOfFailure(e), rounds: [] });
      },
    );
    return () => {
      latest.current++;
    };
  }, [boardId, client, tick]);

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, status: "loading" }));
    setTick((t) => t + 1);
  }, []);

  return boardId ? { ...state, refresh } : { status: "needs-server", rounds: [], refresh };
}
