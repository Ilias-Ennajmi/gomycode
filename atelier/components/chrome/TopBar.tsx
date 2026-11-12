"use client";

import { Check, CloudOff, Download, LoaderCircle, Presentation, Share2, TriangleAlert, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useOptionalEditor } from "@/components/editor/EditorContext";
import { syncStatusText, type SyncStatus } from "@/lib/sync/status";
import { Tip } from "./Tip";
import { chromeTextButton } from "./controls";

const PHASE_NOTE = "Coming in Phase 3";

export type TopBarProps = {
  boardId: string;
  title: string;
  /** Called with the new, trimmed, non-empty title. The board list is the source of truth for it. */
  onTitleChange(title: string): void;
  /** Folder names from the top down, e.g. ["Clients", "Acme"]. */
  breadcrumb?: string[];
  status: SyncStatus;
  /** Local-only mode: there is no server; the status says the board lives on this device. */
  localOnly?: boolean;
};

const STATUS_ICON: Record<SyncStatus, LucideIcon> = { saved: Check, syncing: LoaderCircle, offline: CloudOff, error: TriangleAlert };

/**
 * Top-left: the wordmark (home), the folder breadcrumb, the editable board title and the sync status. Top-right:
 * Present, Share (the one primary button) and Export, which arrive in Phase 3 and are disabled until then.
 */
export function TopBar({ title, onTitleChange, breadcrumb = [], status, localOnly = false }: TopBarProps) {
  return (
    <header className="pointer-events-none fixed inset-x-2 top-2 z-(--z-toolbar) flex items-start justify-between gap-2 sm:inset-x-3 sm:top-3">
      <h1 className="sr-only">Board editor</h1>
      <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-line bg-panel p-1 shadow-2 sm:flex-none sm:gap-2 sm:pr-3">
        <Link href="/" aria-label="Atelier home" className="inline-flex shrink-0 items-center justify-center rounded-md px-1.5 py-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11">
          <span className="md:hidden">
            <Image className="lockup-light size-7" src="/brand/atelier-mark-light.svg" alt="" width={28} height={28} unoptimized priority />
            <Image className="lockup-dark size-7" src="/brand/atelier-mark-dark.svg" alt="" width={28} height={28} unoptimized priority />
          </span>
          <span className="hidden md:inline-flex">
            <Image className="lockup-light h-7 w-auto" src="/brand/atelier-lockup-light.svg" alt="" width={83} height={28} unoptimized priority />
            <Image className="lockup-dark h-7 w-auto" src="/brand/atelier-lockup-dark.svg" alt="" width={83} height={28} unoptimized priority />
          </span>
        </Link>
        <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />
        <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
          <ol className="flex items-center gap-1.5 text-(length:--text-sm) text-fg-muted">
            <li>
              <Link href="/" className="inline-flex min-h-(--target-min) items-center rounded-sm px-1 hoverable:text-fg hoverable:underline">
                Boards
              </Link>
            </li>
            {breadcrumb.map((name, i) => (
              <li key={`${i}-${name}`} className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true">/</span>
                <span className="max-w-32 truncate">{name}</span>
              </li>
            ))}
            <li aria-hidden="true">/</li>
          </ol>
        </nav>
        <TitleField title={title} onCommit={onTitleChange} />
        <SyncStatusText status={status} localOnly={localOnly} />
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-lg border border-line bg-panel p-1 shadow-2">
        <PhaseButton label="Present" icon={Presentation} />
        <PhaseButton label="Share" icon={Share2} primary />
        <ExportButton />
      </div>
    </header>
  );
}

function TitleField({ title, onCommit }: { title: string; onCommit(t: string): void }) {
  // The text being typed while the field has focus; otherwise the field simply shows the board's title.
  const [draft, setDraft] = useState(title);
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== title) onCommit(next);
    else setDraft(title);
  };

  return (
    <input
      aria-label="Board title"
      value={focused ? draft : title}
      maxLength={300}
      spellCheck={false}
      autoComplete="off"
      onFocus={(e) => {
        setDraft(title);
        setFocused(true);
        e.currentTarget.select();
      }}
      onBlur={() => {
        setFocused(false);
        if (cancelled.current) cancelled.current = false;
        else commit();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelled.current = true; // the blur below must not save what was typed
          setDraft(title);
          e.currentTarget.blur();
          cancelled.current = false;
        }
      }}
      style={{ fieldSizing: "content" } as React.CSSProperties}
      className="h-8 min-w-24 max-w-full flex-1 truncate rounded-md border border-transparent bg-transparent px-2 text-(length:--text-md) font-medium text-fg sm:max-w-72 sm:flex-none pointer-coarse:h-11 hoverable:border-line"
    />
  );
}

function SyncStatusText({ status, localOnly }: { status: SyncStatus; localOnly: boolean }) {
  const Icon = localOnly ? Check : STATUS_ICON[status];
  const text = syncStatusText(status, localOnly);
  return (
    <span
      data-sync-status={localOnly ? "local" : status}
      title={text}
      className={`inline-flex shrink-0 items-center gap-1.5 px-1 text-(length:--text-sm) whitespace-nowrap ${status === "error" && !localOnly ? "text-alert" : "text-fg-muted"}`}
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2} className={status === "syncing" && !localOnly ? "motion-safe:animate-spin" : ""} />
      <span className="max-sm:sr-only">{text}</span>
    </span>
  );
}

/** A Phase 3 action: disabled, with the reason as its tooltip and as its accessible description. */
function PhaseButton({ label, icon: Icon, primary = false }: { label: string; icon: LucideIcon; primary?: boolean }) {
  const noteId = useId();
  return (
    <Tip label={PHASE_NOTE} side="bottom">
      <button
        type="button"
        disabled
        aria-describedby={noteId}
        className={`${chromeTextButton} text-(length:--text-sm) font-medium ${primary ? "bg-brand text-on-brand" : ""}`}
      >
        <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
        <span className={primary ? "" : "max-sm:sr-only"}>{label}</span>
      </button>
      <span id={noteId} className="sr-only">
        {PHASE_NOTE}
      </span>
    </Tip>
  );
}
/** Opens the Export dialog (also Mod+Shift+E). Without an editor around it (a bare top bar) it stays a disabled Phase 3 button. */
function ExportButton() {
  const editor = useOptionalEditor();
  if (!editor) return <PhaseButton label="Export" icon={Download} />;
  return (
    <Tip label="Export (Ctrl+Shift+E)" side="bottom">
      <button type="button" onClick={() => editor.run("export.open")} className={`${chromeTextButton} text-(length:--text-sm) font-medium`}>
        <Download aria-hidden="true" size={16} strokeWidth={1.75} />
        <span className="max-sm:sr-only">Export</span>
      </button>
    </Tip>
  );
}
