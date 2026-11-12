"use client";

import { useId, useState, type FormEvent } from "react";
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui/controls";
import type { Folder } from "@/lib/sync/board-list-cache";
import { Dialog } from "./Dialog";
import { buildFolderTree, folderPath, type FolderNode } from "./library";

function Actions({ onClose, submit, busy = false }: { onClose: () => void; submit: string; busy?: boolean }) {
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button type="button" className={buttonSecondary} onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className={buttonPrimary} disabled={busy}>
        {submit}
      </button>
    </div>
  );
}

/** One text field in a dialog: used for renaming boards and naming folders. */
export function NameDialog({
  heading,
  label,
  initial,
  submitLabel,
  maxLength,
  onSubmit,
  onClose,
}: {
  heading: string;
  label: string;
  initial: string;
  submitLabel: string;
  maxLength: number;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const empty = value.trim() === "";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (empty) return;
    onSubmit(value.trim());
    onClose();
  }

  return (
    <Dialog labelledBy={`${id}-h`} onClose={onClose}>
      <form onSubmit={submit}>
        <h2 id={`${id}-h`} className="mb-5 text-(length:--text-lg) font-semibold">
          {heading}
        </h2>
        <label htmlFor={`${id}-f`} className={labelClass}>
          {label}
        </label>
        <input
          id={`${id}-f`}
          data-autofocus
          className={inputClass}
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Actions onClose={onClose} submit={submitLabel} busy={empty} />
      </form>
    </Dialog>
  );
}

/** Pick a folder (or none) for a board. */
export function MoveDialog({
  boardTitle,
  folders,
  currentFolderId,
  onSubmit,
  onClose,
}: {
  boardTitle: string;
  folders: Folder[];
  currentFolderId: string | null;
  onSubmit: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<string>(currentFolderId ?? "");
  const rows: Array<{ value: string; label: string; depth: number }> = [{ value: "", label: "No folder", depth: 0 }];
  const walk = (nodes: FolderNode[]) =>
    nodes.forEach((n) => {
      rows.push({ value: n.folder.id, label: folderPath(folders, n.folder.id), depth: n.depth });
      walk(n.children);
    });
  walk(buildFolderTree(folders));

  return (
    <Dialog labelledBy={`${id}-h`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(choice || null);
          onClose();
        }}
      >
        <h2 id={`${id}-h`} className="mb-1 text-(length:--text-lg) font-semibold">
          Move to…
        </h2>
        <p className="mb-4 truncate text-(length:--text-sm) text-fg-muted">{boardTitle}</p>
        <fieldset>
          <legend className="sr-only">Folder</legend>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {rows.map((r) => (
              <label key={r.value || "none"} className="block cursor-pointer">
                <input type="radio" name={`${id}-f`} value={r.value} checked={choice === r.value} onChange={() => setChoice(r.value)} className="peer sr-only" />
                <span
                  className="flex min-h-11 items-center rounded-md border border-transparent px-3 text-(length:--text-md) peer-checked:border-brand peer-checked:bg-(--color-selection-fill) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-select hoverable:bg-line"
                  style={{ paddingInlineStart: `calc(var(--space-3) + ${r.depth} * var(--space-4))` }}
                >
                  {r.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Actions onClose={onClose} submit="Move" />
      </form>
    </Dialog>
  );
}

export function ConfirmFolderDelete({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog role="alertdialog" labelledBy={`${id}-h`} describedBy={`${id}-d`} onClose={onClose}>
      <h2 id={`${id}-h`} className="mb-2 text-(length:--text-lg) font-semibold">
        Delete the folder “{name}”?
      </h2>
      <p id={`${id}-d`} className="mb-6 text-(length:--text-sm) text-fg-muted">
        The boards inside are kept and move to the top level. Folders inside it move up one level.
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" data-autofocus className={buttonSecondary} onClick={onClose}>
          Keep it
        </button>
        <button
          type="button"
          className={buttonDanger}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          Delete folder
        </button>
      </div>
    </Dialog>
  );
}
