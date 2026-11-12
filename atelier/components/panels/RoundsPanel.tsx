"use client";

import { Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { useBoardInfo } from "@/components/rounds/BoardInfo";
import { useRoundsSync } from "@/components/rounds/useRoundsSync";
import { RestoreDialog } from "@/components/rounds/RestoreDialog";
import { useRounds } from "@/components/rounds/useRounds";
import { buttonPrimary, buttonSecondary } from "@/components/ui/controls";
import { createRoundsClient, type RoundsClient } from "@/lib/engine/rounds/client";
import { summariseDiff } from "@/lib/engine/rounds/diff";
import { formatWhen, roundTitle } from "@/lib/engine/rounds/format";
import type { Round } from "@/lib/share/round-types";

const small = "inline-flex min-h-9 items-center rounded-md border border-line bg-panel px-2.5 text-(length:--text-sm) font-medium text-fg transition-[transform,border-color] duration-(--dur-fast) ease-out active:scale-[0.97] hoverable:border-fg-muted pointer-coarse:min-h-11 disabled:opacity-50 disabled:pointer-events-none";

export const NEEDS_SERVER = "Rounds need the server. They aren't available right now; your board is safe on this device.";

/** "3 added · 5 changed · 1 removed", "First round · 12 objects", "No changes". */
export function diffSentence(round: Round): string {
  const t = summariseDiff(round.diff);
  if (round.number === 1) return `First round · ${t.added} object${t.added === 1 ? "" : "s"}`;
  if (t.total === 0) return "No changes";
  return `${t.added} added · ${t.changed} changed · ${t.removed} removed`;
}

/** Active share links per round id (a revoked or expired link no longer shows the round to anyone). */
function useLinkCounts(boardId: string | null): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/share-links`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { links?: { roundId: string | null; status: string }[] };
        const next = new Map<string, number>();
        for (const l of body.links ?? []) if (l.roundId && l.status === "ok") next.set(l.roundId, (next.get(l.roundId) ?? 0) + 1);
        if (!cancelled) setCounts(next);
      } catch {
        /* the count is a nicety */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);
  return counts;
}

/**
 * The Rounds panel: every published round (newest first) with its number, label, date and what it changed, Publish round…,
 * Compare (with the board as it is now, or any two) and Restore…. Nothing here deletes a round.
 */
export function RoundsPanel({ client: given }: { client?: RoundsClient }) {
  const info = useBoardInfo();
  const { handle, run, toast, navigate } = useEditor();
  const client = useMemo(() => given ?? createRoundsClient(), [given]);
  const { status, rounds, refresh } = useRounds(info?.boardId ?? null, client);
  const sync = useRoundsSync(info, handle.doc);
  const linkCounts = useLinkCounts(info?.boardId ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [restoring, setRestoring] = useState<Round | null>(null);

  if (!info) return <p className="p-4 text-(length:--text-sm) text-fg-muted">{NEEDS_SERVER}</p>;
  const boardId = info.boardId;
  const compare = (a: string, b: string) => navigate(`/b/${encodeURIComponent(boardId)}/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
  const byId = new Map(rounds.map((r) => [r.id, r]));
  const pair = picked.map((id) => byId.get(id)).filter((r): r is Round => !!r).sort((x, y) => x.number - y.number);
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? cur : [...cur, id]));

  return (
    <div className="flex flex-col gap-3 p-3" data-rounds-panel="">
      <button type="button" className={`${buttonPrimary} w-full`} onClick={() => run("round.publish")}>
        <Send aria-hidden="true" size={16} />
        Publish round…
      </button>

      {status === "loading" ? (
        <p role="status" className="text-(length:--text-sm) text-fg-muted">
          Loading rounds…
        </p>
      ) : status === "needs-server" ? (
        <p className="text-(length:--text-sm) text-fg-muted">{NEEDS_SERVER}</p>
      ) : status === "error" ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-(length:--text-sm) text-alert">
            Couldn&rsquo;t load the rounds.
          </p>
          <button type="button" className={buttonSecondary} onClick={refresh}>
            Retry
          </button>
        </div>
      ) : rounds.length === 0 ? (
        <p className="text-(length:--text-sm) text-fg-muted">No rounds yet. A round freezes the board as it is now, so clients review a version that doesn&rsquo;t move while you keep working.</p>
      ) : (
        <>
          <ul aria-label="Rounds" className="flex flex-col gap-2">
            {rounds.map((r) => {
              const links = linkCounts.get(r.id) ?? 0;
              const checked = picked.includes(r.id);
              return (
                <li key={r.id} className="rounded-md border border-line p-3" data-round-id={r.id}>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-(--color-accent)"
                      aria-label={`Select Round ${r.number} to compare`}
                      checked={checked}
                      disabled={!checked && picked.length >= 2}
                      onChange={() => toggle(r.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-(length:--text-md) font-medium">{roundTitle(r)}</p>
                      <p className="text-(length:--text-xs) text-fg-muted">{formatWhen(r.publishedAt)}</p>
                      <p className="mt-1 text-(length:--text-sm)">{diffSentence(r)}</p>
                      {links > 0 ? (
                        <p className="text-(length:--text-xs) text-fg-muted">
                          {links} link{links === 1 ? "" : "s"} show{links === 1 ? "s" : ""} this round
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={small} onClick={() => compare(r.snapshotId, "current")}>
                      Compare with current
                    </button>
                    <button type="button" className={small} onClick={() => setRestoring(r)}>
                      Restore…
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {picked.length > 0 ? (
            <button type="button" className={buttonSecondary} disabled={pair.length !== 2} onClick={() => pair.length === 2 && compare(pair[0].snapshotId, pair[1].snapshotId)}>
              Compare selected
            </button>
          ) : null}
        </>
      )}

      {restoring ? (
        <RestoreDialog
          boardId={boardId}
          doc={handle.doc}
          version={{ snapshotId: restoring.snapshotId, label: roundTitle(restoring) }}
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
