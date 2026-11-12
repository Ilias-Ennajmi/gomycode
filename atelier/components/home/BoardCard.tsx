"use client";

import Link from "next/link";
import { Copy, FolderInput, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import type { BoardSummary } from "@/lib/sync/board-list-cache";
import { ActionMenu, type MenuAction } from "./ActionMenu";
import { daysLeftInTrash, relativeTime } from "./library";
import { previewUrl } from "./preview-url";

export type CardHandlers = {
  onRename: (b: BoardSummary) => void;
  onDuplicate: (b: BoardSummary) => void;
  onMove: (b: BoardSummary) => void;
  onToggleStar: (b: BoardSummary) => void;
  onDelete: (b: BoardSummary) => void;
  onRestore: (b: BoardSummary) => void;
};

/** The card's picture: up to four images as a mosaic, else a paper tile naming the first frame. */
function Preview({ board }: { board: BoardSummary }) {
  const urls = board.preview.map(previewUrl).filter((u): u is string => Boolean(u)).slice(0, 4);
  const layout = urls.length >= 3 ? "grid-cols-2 grid-rows-2" : urls.length === 2 ? "grid-cols-2" : "";
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-panel transition-shadow duration-(--dur-fast) ease-out group-hover/card:shadow-2"
    >
      {urls.length > 0 ? (
        <div className={`grid h-full w-full gap-px bg-line ${layout}`}>
          {urls.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${u}-${i}`} src={u} alt="" crossOrigin="anonymous" loading="lazy" decoding="async" className={`h-full w-full object-cover ${urls.length === 3 && i === 0 ? "row-span-2" : ""}`} />
          ))}
        </div>
      ) : board.firstFrameName ? (
        <div className="absolute inset-x-5 bottom-5 top-5 flex items-end rounded-sm border border-dashed border-line p-2">
          <span className="truncate text-(length:--text-xs) text-fg-muted">{board.firstFrameName}</span>
        </div>
      ) : null}
    </div>
  );
}

export function BoardCard({ board, trash, disabled, handlers }: { board: BoardSummary; trash: boolean; disabled: boolean; handlers: CardHandlers }) {
  if (trash) {
    const left = board.deletedAt ? daysLeftInTrash(board.deletedAt) : 0;
    return (
      <article className="flex flex-col">
        <div className="opacity-70">
          <Preview board={board} />
        </div>
        <div className="flex items-start justify-between gap-2 px-1 pt-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{board.title}</p>
            <p className="text-(length:--text-sm) text-fg-muted">
              Deleted {board.deletedAt ? relativeTime(board.deletedAt) : ""} · {left} {left === 1 ? "day" : "days"} left
            </p>
          </div>
          <button
            type="button"
            aria-label={`Restore ${board.title}`}
            disabled={disabled}
            onClick={() => handlers.onRestore(board)}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-3 text-(length:--text-sm) font-medium transition-[transform,border-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60 pointer-coarse:min-h-11 hoverable:border-fg-muted"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Restore
          </button>
        </div>
      </article>
    );
  }

  const actions: MenuAction[] = [
    { label: "Rename", icon: Pencil, onSelect: () => handlers.onRename(board) },
    { label: "Duplicate", icon: Copy, onSelect: () => handlers.onDuplicate(board) },
    { label: "Move to…", icon: FolderInput, onSelect: () => handlers.onMove(board) },
    { label: board.starred ? "Unstar" : "Star", icon: Star, onSelect: () => handlers.onToggleStar(board) },
    { label: "Delete", icon: Trash2, onSelect: () => handlers.onDelete(board), danger: true },
  ];

  return (
    <article className="group/card relative">
      <Link
        href={`/b/${board.id}`}
        className="block rounded-lg outline-offset-4 transition-transform duration-(--dur-fast) ease-out active:scale-[0.98]"
      >
        <Preview board={board} />
        <span className="mt-2 block px-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{board.title}</span>
            {board.starred ? (
              <>
                <Star size={13} aria-hidden="true" className="shrink-0 fill-current text-brand" />
                <span className="sr-only">Starred</span>
              </>
            ) : null}
          </span>
          <span className="block text-(length:--text-sm) text-fg-muted">Edited {relativeTime(board.lastOpenedAt && board.lastOpenedAt > board.updatedAt ? board.lastOpenedAt : board.updatedAt)}</span>
        </span>
      </Link>
      <ActionMenu
        label={`Actions for ${board.title}`}
        items={actions}
        disabled={disabled}
        className="absolute right-1.5 top-1.5 rounded-md bg-panel/90 shadow-1"
      />
    </article>
  );
}
