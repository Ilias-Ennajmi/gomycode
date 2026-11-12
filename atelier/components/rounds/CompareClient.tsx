"use client";

import { useEffect, useState } from "react";
import { CompareView } from "@/components/canvas/CompareView";
import { readLocalBoardState } from "@/components/home/board-docs";
import { buttonSecondary } from "@/components/ui/controls";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { docFromState } from "@/lib/engine/doc/from-state";
import { createRoundsClient, RoundsRequestError, type HistoryVersion, type RoundsClient } from "@/lib/engine/rounds/client";
import { roundTitle } from "@/lib/engine/rounds/format";

export const SNAPSHOT_PARAM = /^[A-Za-z0-9_-]{1,64}$/;
const CURRENT = "current";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; a: { doc: BoardDoc; label: string }; b: { doc: BoardDoc; label: string } };

class NoLocalCopy extends Error {}

/** "Round 2 · Direction A", "10 Nov, 09:30 · Before restore": what a version is called in the compare view. */
export function versionLabel(v: HistoryVersion | undefined, fallback: string): string {
  if (!v) return fallback;
  if (v.kind === "round" && v.roundNumber !== null) return roundTitle({ number: v.roundNumber, label: v.label ?? "" });
  const when = new Date(v.createdAt);
  const date = Number.isNaN(when.getTime()) ? "Earlier version" : when.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return v.label ? `${date} · ${v.label}` : date;
}

function messageFor(e: unknown): string {
  if (e instanceof NoLocalCopy) return "This device has no copy of the board to compare with. Open the board here first.";
  if (e instanceof RoundsRequestError) {
    if (e.status === 503) return "Comparing needs the server, and it isn't available right now.";
    if (e.status === 404) return "That version could not be found. It may belong to another board.";
    if (e.status === 401 || e.status === 403) return "You're signed out. Sign in again to compare versions.";
  }
  return "Couldn't load those versions to compare.";
}

/**
 * Loads the two states to compare (a version from the server, and either another version or this device's copy of the board
 * as it is now), shows them in the CompareView, and destroys both documents when the page closes: two documents, never more.
 */
export function CompareClient({
  boardId,
  a,
  b,
  assets,
  onClose,
  client,
  loadCurrent = readLocalBoardState,
  onDocs,
}: {
  boardId: string;
  a: string;
  b: string;
  assets: AssetResolver;
  onClose(): void;
  client?: RoundsClient;
  /** This device's copy of the board as Yjs state, or null when there is none. */
  loadCurrent?: (boardId: string) => Promise<Uint8Array | null>;
  /** Tests: told which documents were made. */
  onDocs?: (docs: BoardDoc[]) => void;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    const made: BoardDoc[] = [];
    const rounds = client ?? createRoundsClient();
    void (async () => {
      try {
        if (!SNAPSHOT_PARAM.test(a) || (b !== CURRENT && !SNAPSHOT_PARAM.test(b))) {
          setState({ phase: "error", message: "Can't compare: the link is not valid." });
          return;
        }
        const wanted = [a, b].filter((id) => id !== CURRENT);
        const [history, ...states] = await Promise.all([
          rounds.listHistory(boardId).catch(() => [] as HistoryVersion[]),
          ...wanted.map((id) => rounds.fetchSnapshot(boardId, id)),
        ]);
        const bytes = new Map(wanted.map((id, i) => [id, states[i]]));
        let current: Uint8Array | null = null;
        if (a === CURRENT || b === CURRENT) {
          current = await loadCurrent(boardId);
          if (!current) throw new NoLocalCopy();
        }
        if (cancelled) return;
        const open = (id: string) => {
          const doc = docFromState(id === CURRENT ? current! : bytes.get(id)!);
          made.push(doc);
          return doc;
        };
        const side = (id: string, fallback: string) => ({ doc: open(id), label: id === CURRENT ? "Current board" : versionLabel(history.find((v) => v.id === id), fallback) });
        const left = side(a, "Version A");
        const right = side(b, "Version B");
        onDocs?.(made);
        setState({ phase: "ready", a: left, b: right });
      } catch (e) {
        if (!cancelled) setState({ phase: "error", message: messageFor(e) });
      }
    })();
    return () => {
      cancelled = true;
      for (const d of made) d.destroy();
    };
  }, [boardId, a, b, client, loadCurrent, onDocs]);

  if (state.phase === "loading") {
    return (
      <div role="status" className="grid min-h-dvh place-items-center bg-canvas p-6 text-fg-muted">
        Loading the versions to compare…
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-fg">
        <div className="flex max-w-md flex-col items-start gap-4">
          <p role="alert" className="text-(length:--text-md)">
            {state.message}
          </p>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Back to the board
          </button>
        </div>
      </div>
    );
  }
  return <CompareView a={state.a} b={state.b} assets={assets} onClose={onClose} />;
}
