"use client";

import { useId, useState, type FormEvent } from "react";
import { Columns3, File, LayoutGrid, Lightbulb, Presentation, Workflow, type LucideIcon } from "lucide-react";
import { TEMPLATES, type TemplateId } from "@/lib/engine/model/templates";
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from "@/components/ui/controls";
import type { Folder } from "@/lib/sync/board-list-cache";
import { Dialog } from "./Dialog";
import { folderPath } from "./library";

const ICONS: Record<TemplateId, LucideIcon> = {
  blank: File,
  moodboard: LayoutGrid,
  deck: Presentation,
  brainstorm: Lightbulb,
  flowchart: Workflow,
  kanban: Columns3,
};

export type NewBoardInput = { title: string; folderId: string | null; templateId: string };

export function NewBoardDialog({
  folders,
  defaultFolderId,
  onCreate,
  onClose,
}: {
  folders: Folder[];
  defaultFolderId: string | null;
  onCreate: (input: NewBoardInput) => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<TemplateId>("blank");
  const [folderId, setFolderId] = useState<string>(defaultFolderId ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onCreate({ title, folderId: folderId || null, templateId: template });
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...folders].sort((a, b) => folderPath(folders, a.id).localeCompare(folderPath(folders, b.id)));

  return (
    <Dialog labelledBy={`${id}-title`} onClose={onClose} widthClass="w-[min(40rem,calc(100vw-2rem))]">
      <form onSubmit={submit}>
        <h2 id={`${id}-title`} className="mb-5 text-(length:--text-lg) font-semibold">
          New board
        </h2>

        <label htmlFor={`${id}-name`} className={labelClass}>
          Title
        </label>
        <input
          id={`${id}-name`}
          data-autofocus
          className={inputClass}
          value={title}
          maxLength={300}
          placeholder="Untitled"
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value)}
        />

        {folders.length > 0 ? (
          <div className="mt-4">
            <label htmlFor={`${id}-folder`} className={labelClass}>
              Folder
            </label>
            <select id={`${id}-folder`} className={inputClass} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">No folder</option>
              {sorted.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(folders, f.id)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <fieldset className="mt-5">
          <legend className={labelClass}>Template</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {TEMPLATES.map((t) => {
              const Icon = ICONS[t.id];
              return (
                <label key={t.id} className="block cursor-pointer">
                  <input
                    type="radio"
                    name={`${id}-template`}
                    value={t.id}
                    checked={template === t.id}
                    onChange={() => setTemplate(t.id)}
                    className="peer sr-only"
                  />
                  <span className="flex h-full min-h-24 flex-col gap-1 rounded-md border border-line bg-panel p-3 transition-[transform,border-color,background-color] duration-(--dur-fast) ease-out peer-checked:border-brand peer-checked:bg-(--color-selection-fill) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-select active:scale-[0.98] hoverable:border-fg-muted">
                    <Icon size={20} aria-hidden="true" className="text-brand" />
                    <span className="text-(length:--text-md) font-medium">{t.name}</span>
                    <span className="text-(length:--text-xs) text-fg-muted">{t.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonPrimary} disabled={busy}>
            {busy ? "Creating…" : "Create board"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
