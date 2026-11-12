"use client";

import { Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAssetResolver } from "@/lib/assets/resolver";
import { AssetUploader } from "@/lib/assets/upload-queue";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { importBackup, ImportError } from "@/lib/engine/export/backup";
import { buttonSecondary } from "@/components/ui/controls";

type Actions = {
  createImportedBoard(title: string): Promise<string | null>;
  attachImportedBoard(id: string, title: string, state: Uint8Array): Promise<void>;
};

export function describeImportFailure(e: unknown): string {
  if (e instanceof ImportError) return e.message;
  const raw = e instanceof Error ? e.message : "";
  return raw ? `Couldn't import that backup: ${raw}` : "Couldn't import that backup.";
}

/**
 * "Import backup…": pick or drop a `.atelier` file. It is read, checked and restored as a NEW board (nothing existing is
 * replaced); pictures go through the normal upload pipeline. Progress and Cancel show while it runs; the result (and anything
 * that could not be restored) is announced.
 */
export function ImportBackup({
  actions,
  localOnly,
  disabled,
  notify,
  onOpen,
}: {
  actions: Actions;
  localOnly: boolean;
  disabled: boolean;
  notify: (message: string, action?: { label: string; run: () => void }) => void;
  onOpen: (boardId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [run, setRun] = useState<{ ratio: number; label: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const uploader = useRef<AssetUploader | null>(null);
  const busy = useRef(false);

  const start = useCallback(
    async (file: File) => {
      if (busy.current) return;
      busy.current = true;
      const ac = new AbortController();
      abort.current = ac;
      setRun({ ratio: 0, label: "Reading the backup" });
      try {
        uploader.current ??= new AssetUploader({ doc: new BoardDoc(), resolver: getAssetResolver(), localOnly });
        const up = uploader.current;
        let createdId = "";
        const result = await importBackup(
          file,
          {
            uploader: up,
            createBoard: async (title) => {
              const id = await actions.createImportedBoard(title);
              if (!id) throw new Error(localOnly ? "the board could not be created" : "you may be offline");
              createdId = id;
              return id;
            },
            writeBoardState: (id, state, title) => actions.attachImportedBoard(id, title, state),
          },
          { signal: ac.signal, onProgress: (ratio, label) => setRun({ ratio, label }) },
        );
        const notes = [
          result.skippedObjects ? `${result.skippedObjects} object${result.skippedObjects === 1 ? "" : "s"} could not be restored` : "",
          result.failedAssets.length ? `${result.failedAssets.length} picture${result.failedAssets.length === 1 ? "" : "s"} could not be restored` : "",
        ].filter(Boolean);
        notify(`Imported “${result.title}”${notes.length ? ` (${notes.join(", ")})` : ""}`, { label: "Open", run: () => onOpen(createdId || result.boardId) });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") notify("Import cancelled");
        else notify(describeImportFailure(e));
      } finally {
        busy.current = false;
        abort.current = null;
        setRun(null);
      }
    },
    [actions, localOnly, notify, onOpen],
  );

  // A `.atelier` file dropped anywhere on the page is imported too.
  useEffect(() => {
    if (disabled) return;
    const isBackup = (f: File) => /\.atelier$/i.test(f.name);
    const over = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === "file")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const f = Array.from(e.dataTransfer?.files ?? []).find(isBackup);
      if (!f) return;
      e.preventDefault();
      void start(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [disabled, start]);

  const pct = Math.round((run?.ratio ?? 0) * 100);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".atelier,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-import-input=""
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void start(f);
        }}
      />
      <button type="button" className={`${buttonSecondary} max-sm:min-w-11 max-sm:px-0`} disabled={disabled || run !== null} onClick={() => input.current?.click()}>
        <Upload size={18} aria-hidden="true" />
        <span className="max-sm:sr-only">Import backup…</span>
      </button>
      {run ? (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 z-(--z-toast) flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 rounded-lg border border-line bg-panel p-4 shadow-3" data-import-progress="">
          <div className="flex items-center justify-between gap-3 text-(length:--text-sm)">
            <span>Importing: {run.label}</span>
            <span aria-hidden="true">{pct}%</span>
          </div>
          <div role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-end">
            <button type="button" className={buttonSecondary} onClick={() => abort.current?.abort()}>
              Cancel import
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
