"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/home/Dialog";
import { buttonPrimary, buttonSecondary, helpClass, inputClass, labelClass } from "@/components/ui/controls";
import type { ToastFn } from "@/lib/engine/commands/registry";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { PublishError, publishRoundFlow, type PublishDeps, type PublishedRound } from "@/lib/engine/export/preview";
import type { FrameObj } from "@/lib/engine/model/types";
import { diffStateToDoc } from "@/lib/engine/rounds/compare";
import { summariseDiff } from "@/lib/engine/rounds/diff";
import { roundTitle } from "@/lib/engine/rounds/format";
import type { RoundsClient } from "@/lib/engine/rounds/client";
import type { Round, RoundDiff } from "@/lib/share/round-types";

type Props = {
  boardId: string;
  doc: BoardDoc;
  client: RoundsClient;
  /** What keeps the server's copy of the board current: sync, or in local-only mode a hand-over of the whole state. */
  sync: PublishDeps["sync"];
  exporter: PublishDeps["exporter"];
  assets: PublishDeps["assets"];
  toast: ToastFn;
  onClose(): void;
  /** Open the Rounds panel (the toast's action). */
  onOpenRounds(): void;
  /** Injected in tests. */
  flow?: typeof publishRoundFlow;
  upload?: PublishDeps["upload"];
};

type Before =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "first" }
  | { state: "ready"; previous: Round; diff: RoundDiff };

type Run = { state: "idle" } | { state: "running"; ratio: number; label: string } | { state: "done"; round: PublishedRound } | { state: "error"; message: string };

/** PUT a preview image to its presigned URL. The type must match the one the server signed. */
async function putImage(url: string, blob: Blob): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "content-type": "image/webp" }, body: blob });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
}

const MAX_FRAME_ROWS = 4;

/** "2 added · 1 changed": only the kinds that happened. */
function countsSentence(c: { added: number; changed: number; removed: number }): string {
  return [c.added ? `${c.added} added` : "", c.changed ? `${c.changed} changed` : "", c.removed ? `${c.removed} removed` : ""].filter(Boolean).join(" · ");
}

/**
 * "Publish round…": a label, what changed since the previous round, then one click. Publishing runs in steps with a progress bar
 * and Cancel (nothing is created until the last step, so cancelling leaves nothing behind). Trouble with the preview images
 * does not stop it: the round is published and the dialog lists what is missing.
 */
export function PublishDialog({ boardId, doc, client, sync, exporter, assets, toast, onClose, onOpenRounds, flow = publishRoundFlow, upload = putImage }: Props) {
  const uid = useId();
  const [label, setLabel] = useState("");
  const [before, setBefore] = useState<Before>({ state: "loading" });
  const [run, setRun] = useState<Run>({ state: "idle" });
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
  }, []);

  // What changed since the previous round: this board as it is now against that round's frozen state (two documents at most).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rounds = await client.listRounds(boardId);
        if (cancelled) return;
        const previous = rounds[0];
        if (!previous) return setBefore({ state: "first" });
        const state = await client.fetchSnapshot(boardId, previous.snapshotId);
        if (cancelled) return;
        // Let the dialog paint before a large board is compared.
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;
        setBefore({ state: "ready", previous, diff: diffStateToDoc(state, doc) });
      } catch {
        // The server is not there (not configured, signed out, offline): nothing to compare with, and nothing to publish to.
        if (!cancelled) setBefore({ state: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, client, doc]);

  const frameRows = useMemo(() => {
    if (before.state !== "ready") return [];
    return Object.entries(before.diff.byFrame)
      .map(([id, c]) => ({ id, name: id === "_none" ? "Outside frames" : ((doc.get(id) as FrameObj | undefined)?.name || "Frame"), ...c }))
      .sort((a, b) => b.added + b.changed + b.removed - (a.added + a.changed + a.removed) || a.name.localeCompare(b.name));
  }, [before, doc]);

  const running = run.state === "running";

  async function publish() {
    if (running) return;
    const ac = new AbortController();
    abort.current = ac;
    setRun({ state: "running", ratio: 0, label: "Starting" });
    try {
      const round = await flow(
        { boardId, doc, sync, api: client, exporter, assets, upload },
        label,
        ac.signal,
        (ratio, text) => {
          if (alive.current) setRun((cur) => (cur.state === "running" ? { state: "running", ratio, label: text } : cur));
        },
      );
      if (!alive.current) return;
      toast({ message: `Published ${roundTitle(round)}`, durationMs: 8000, action: { label: "Open Rounds", run: onOpenRounds } });
      if (round.warnings.length > 0) setRun({ state: "done", round });
      else onClose();
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof PublishError && e.code === "cancelled") {
        setRun({ state: "idle" });
        return;
      }
      setRun({ state: "error", message: e instanceof PublishError ? e.message : "The round could not be published. Try again." });
    } finally {
      if (abort.current === ac) abort.current = null;
    }
  }

  const titleId = `${uid}-title`;
  const summary = before.state === "ready" ? summariseDiff(before.diff) : null;
  const pct = run.state === "running" ? Math.round(Math.min(1, Math.max(0, run.ratio)) * 100) : 0;

  return (
    <Dialog
      labelledBy={titleId}
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      widthClass="w-[min(30rem,calc(100vw-2rem))]"
    >
      <div data-publish-dialog="">
        <h2 id={titleId} className="mb-1 text-(length:--text-lg) font-semibold">
          Publish round
        </h2>
        <p className={`${helpClass} mb-5`}>A round is a frozen copy of the board, in its current state, that clients can review. You keep editing the board as usual.</p>

        {run.state === "done" ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-(length:--text-md)">
              {roundTitle(run.round)} is published, with a few things to know:
            </p>
            <ul className="list-disc pl-5 text-(length:--text-sm) text-fg-muted">
              {run.round.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonPrimary} data-autofocus="" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void publish();
            }}
          >
            <fieldset disabled={running} className="m-0 min-w-0 border-0 p-0">
              <label htmlFor={`${uid}-label`} className={labelClass}>
                Label (optional)
              </label>
              <input id={`${uid}-label`} className={inputClass} value={label} maxLength={120} autoComplete="off" spellCheck placeholder="Direction A" data-autofocus="" onChange={(e) => setLabel(e.target.value)} />

              <div className="mt-5 rounded-md border border-line p-3 text-(length:--text-sm)" data-testid="publish-changes" aria-live="polite">
                {before.state === "loading" ? (
                  <p className="text-fg-muted">Checking what changed since the last round…</p>
                ) : before.state === "unavailable" ? (
                  <p>Publishing a round needs the server, and it isn&rsquo;t available right now. Your board is safe on this device.</p>
                ) : before.state === "first" ? (
                  <p>This is the first round. Everything on the board is included.</p>
                ) : summary && summary.total === 0 ? (
                  <p>No changes since {before.previous.label}. You can still publish it.</p>
                ) : summary ? (
                  <>
                    <p className="font-medium">
                      Since {before.previous.label}: {summary.added} added · {summary.changed} changed · {summary.removed} removed
                    </p>
                    <ul className="mt-2 flex flex-col gap-1 text-fg-muted">
                      {frameRows.slice(0, MAX_FRAME_ROWS).map((r) => (
                        <li key={r.id} className="flex justify-between gap-3">
                          <span className="truncate">{r.name}</span>
                          <span className="shrink-0">{countsSentence(r)}</span>
                        </li>
                      ))}
                      {frameRows.length > MAX_FRAME_ROWS ? <li>and {frameRows.length - MAX_FRAME_ROWS} more</li> : null}
                    </ul>
                  </>
                ) : null}
              </div>
            </fieldset>

            {run.state === "running" ? (
              <div className="mt-5 flex flex-col gap-2" data-publish-progress="">
                <div className="flex items-center justify-between gap-3 text-(length:--text-sm) text-fg-muted">
                  <span>{run.label}</span>
                  <span aria-hidden="true">{pct}%</span>
                </div>
                <div role="progressbar" aria-label="Publishing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${run.label}, ${pct} percent`} className="h-2 w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ) : null}

            {run.state === "error" ? (
              <p role="alert" className="mt-4 text-(length:--text-sm) text-alert">
                {run.message}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              {running ? (
                <button type="button" className={buttonSecondary} onClick={() => abort.current?.abort()}>
                  Cancel
                </button>
              ) : (
                <>
                  <button type="button" className={buttonSecondary} onClick={onClose}>
                    Close
                  </button>
                  <button type="submit" className={buttonPrimary} disabled={before.state === "unavailable" || before.state === "loading"}>
                    Publish
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
