"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/home/Dialog";
import { buttonPrimary, buttonSecondary, helpClass } from "@/components/ui/controls";
import type { ToastFn } from "@/lib/engine/commands/registry";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { restoreAsCopy, restoreSnapshotInto, type RestoreCopyDeps } from "@/lib/engine/doc/restore";
import type { RoundsClient } from "@/lib/engine/rounds/client";
import { createCopyDeps } from "./restore-deps";

export interface RestoreVersion {
  /** The snapshot to restore (what `GET /api/boards/[id]/snapshots/[sid]` serves). */
  snapshotId: string;
  /** "Round 2", "10 Nov, 09:30": how the dialog and the toast name it. */
  label: string;
}

type Props = {
  boardId: string;
  doc: BoardDoc;
  version: RestoreVersion;
  client: Pick<RoundsClient, "fetchSnapshot" | "createSnapshot">;
  /** Pushes this device's edits to the server (so the safety copy is of what you see). */
  sync: { flush(): Promise<void> };
  toast: ToastFn;
  /** Open another page (the copy). */
  navigate(href: string): void;
  localOnly?: boolean;
  /** Injected in tests. */
  copyDeps?: Pick<RestoreCopyDeps, "createBoard" | "openDoc"> & Partial<RestoreCopyDeps>;
  onClose(): void;
};

type Work = { kind: "idle" } | { kind: "restoring" } | { kind: "copying" };
type Problem = { message: string; /** The safety copy failed: offer to go ahead without it. */ canForce: boolean };

/**
 * "Restore Round 2 into this board? We save the current state first and you can undo." Restoring first asks the server for a
 * safety snapshot of the current state (offline it is skipped, said so, and local undo remains), then makes the board match the
 * version in one undoable edit; it never rewinds history. "Open as copy" instead makes a NEW board from the version and leaves
 * this one alone.
 */
export function RestoreDialog({ boardId, doc, version, client, sync, toast, navigate, localOnly = false, copyDeps, onClose }: Props) {
  const uid = useId();
  const [work, setWork] = useState<Work>({ kind: "idle" });
  const [problem, setProblem] = useState<Problem | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const deps = useMemo(() => copyDeps ?? createCopyDeps({ localOnly }), [copyDeps, localOnly]);
  const busy = work.kind !== "idle";

  async function load(): Promise<Uint8Array | null> {
    try {
      return await client.fetchSnapshot(boardId, version.snapshotId);
    } catch {
      setProblem({ message: "Couldn't load that version from the server. Nothing was changed.", canForce: false });
      return null;
    }
  }

  async function restore(skipSafety: boolean) {
    if (busy) return;
    setWork({ kind: "restoring" });
    setProblem(null);
    try {
      const state = await load();
      if (!state || !alive.current) return;

      let safety: "saved" | "offline" | "skipped" = "skipped";
      if (!skipSafety) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) safety = "offline";
        else {
          try {
            await sync.flush();
            await client.createSnapshot(boardId, "Before restore");
            safety = "saved";
          } catch {
            if (alive.current) setProblem({ message: "Couldn't save a safety copy on the server first. You can still restore: Undo works on this device.", canForce: true });
            return;
          }
        }
      }
      if (!alive.current) return;

      try {
        restoreSnapshotInto(doc, state);
      } catch {
        setProblem({ message: "That version looks damaged, so nothing was changed.", canForce: false });
        return;
      }
      const note = safety === "offline" ? " You're offline, so no safety copy was saved on the server; Undo still works here." : "";
      toast({ message: `Restored ${version.label}.${note}`, durationMs: 9000, action: { label: "Undo", run: () => doc.undo() } });
      onClose();
    } finally {
      if (alive.current) setWork({ kind: "idle" });
    }
  }

  async function copy() {
    if (busy) return;
    setWork({ kind: "copying" });
    setProblem(null);
    try {
      const state = await load();
      if (!state || !alive.current) return;
      try {
        const id = await restoreAsCopy(state, deps, `${doc.meta.title} · ${version.label}`);
        toast({ message: `Made a new board from ${version.label}.`, durationMs: 9000, action: { label: "Open", run: () => navigate(`/b/${id}`) } });
        onClose();
      } catch (e) {
        const why = e instanceof Error && e.message ? ` (${e.message})` : "";
        setProblem({ message: `Couldn't make a copy${why}. This board was not changed.`, canForce: false });
      }
    } finally {
      if (alive.current) setWork({ kind: "idle" });
    }
  }

  const titleId = `${uid}-title`;
  return (
    <Dialog labelledBy={titleId} onClose={onClose} widthClass="w-[min(28rem,calc(100vw-2rem))]">
      <div data-restore-dialog="">
        <h2 id={titleId} className="mb-2 text-(length:--text-lg) font-semibold">
          Restore {version.label}
        </h2>
        <p className="text-(length:--text-md)">Restore {version.label} into this board? We save the current state first and you can undo.</p>
        <p className={`${helpClass} mb-4`}>Or open it as a copy: a new board, and this one stays as it is.</p>

        {problem ? (
          <p role="alert" className="mb-4 text-(length:--text-sm) text-alert">
            {problem.message}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void copy()}>
            {work.kind === "copying" ? "Making a copy…" : "Open as copy"}
          </button>
          <button type="button" className={buttonPrimary} disabled={busy} data-autofocus="" onClick={() => void restore(problem?.canForce === true)}>
            {work.kind === "restoring" ? "Restoring…" : problem?.canForce ? "Restore anyway" : "Restore into this board"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
