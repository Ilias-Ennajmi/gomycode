"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { useBoardInfo } from "@/components/rounds/BoardInfo";
import { useRoundsSync } from "@/components/rounds/useRoundsSync";
import { RestoreDialog } from "@/components/rounds/RestoreDialog";
import { statusOfFailure, type LoadStatus } from "@/components/rounds/useRounds";
import { buttonSecondary } from "@/components/ui/controls";
import { createRoundsClient, type HistoryVersion, type RoundsClient } from "@/lib/engine/rounds/client";
import { dayKey, formatDay, formatTime, formatWhen, roundTitle } from "@/lib/engine/rounds/format";

const small = "inline-flex min-h-9 items-center rounded-md border border-line bg-panel px-2.5 text-(length:--text-sm) font-medium text-fg transition-[transform,border-color] duration-(--dur-fast) ease-out active:scale-[0.97] hoverable:border-fg-muted pointer-coarse:min-h-11";

export const HISTORY_NEEDS_SERVER = "Version history needs the server. It isn't available right now; your board is safe on this device.";

function nameOf(v: HistoryVersion): string {
  if (v.kind === "round" && v.roundNumber !== null) return roundTitle({ number: v.roundNumber, label: v.label ?? "" });
  return v.label ?? "Saved version";
}

/**
 * The version history: the board as the server saved it, one version a day for 30 days, plus every published round. Grouped by
 * day; any version can be compared with the board as it is now, or restored (as a new undoable step, or as a new board).
 */
export function HistoryPanel({ client: given }: { client?: RoundsClient }) {
  const info = useBoardInfo();
  const { handle, toast, navigate } = useEditor();
  const client = useMemo(() => given ?? createRoundsClient(), [given]);
  const [state, setState] = useState<{ status: LoadStatus; versions: HistoryVersion[] }>({ status: "loading", versions: [] });
  const [tick, setTick] = useState(0);
  const sync = useRoundsSync(info, handle.doc);
  const [restoring, setRestoring] = useState<HistoryVersion | null>(null);
  const boardId = info?.boardId ?? null;

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    void client.listHistory(boardId).then(
      (versions) => !cancelled && setState({ status: "ready", versions }),
      (e) => !cancelled && setState({ status: statusOfFailure(e), versions: [] }),
    );
    return () => {
      cancelled = true;
    };
  }, [boardId, client, tick]);

  const groups = useMemo(() => {
    const byDay = new Map<string, HistoryVersion[]>();
    for (const v of state.versions) {
      const key = dayKey(v.createdAt);
      byDay.set(key, [...(byDay.get(key) ?? []), v]);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [state.versions]);

  if (!info || state.status === "needs-server") return <p className="p-4 text-(length:--text-sm) text-fg-muted">{HISTORY_NEEDS_SERVER}</p>;
  const compare = (id: string) => navigate(`/b/${encodeURIComponent(info.boardId)}/compare?a=${encodeURIComponent(id)}&b=current`);

  return (
    <div className="flex flex-col gap-3 p-3" data-history-panel="">
      {state.status === "loading" ? (
        <p role="status" className="text-(length:--text-sm) text-fg-muted">
          Loading versions…
        </p>
      ) : state.status === "error" ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-(length:--text-sm) text-alert">
            Couldn&rsquo;t load the version history.
          </p>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => {
              setState({ status: "loading", versions: [] });
              setTick((t) => t + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-(length:--text-sm) text-fg-muted">No earlier versions yet. The server keeps one version of the board a day for 30 days, and every round you publish, for good.</p>
      ) : (
        groups.map(([key, versions]) => (
          <section key={key} role="group" aria-label={formatDay(versions[0].createdAt)}>
            <h3 className="mb-1 text-(length:--text-xs) font-semibold tracking-wide text-fg-muted uppercase">{formatDay(versions[0].createdAt)}</h3>
            <ul className="flex flex-col gap-2">
              {versions.map((v) => (
                <li key={v.id} className="rounded-md border border-line p-3">
                  <p className="truncate text-(length:--text-md) font-medium">{nameOf(v)}</p>
                  <p className="text-(length:--text-xs) text-fg-muted">{v.kind === "round" ? `Published ${formatTime(v.createdAt)}` : `Saved ${formatTime(v.createdAt)}`}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={small} onClick={() => compare(v.id)}>
                      Compare with current
                    </button>
                    <button type="button" className={small} onClick={() => setRestoring(v)}>
                      Restore…
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {restoring ? (
        <RestoreDialog
          boardId={info.boardId}
          doc={handle.doc}
          version={{ snapshotId: restoring.id, label: restoring.kind === "round" ? nameOf(restoring) : formatWhen(restoring.createdAt) }}
          client={client}
          sync={sync ?? { flush: async () => {} }}
          toast={toast}
          navigate={navigate}
          localOnly={info.localOnly}
          onClose={() => setRestoring(null)}
        />
      ) : null}
    </div>
  );
}
