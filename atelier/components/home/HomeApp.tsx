"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Settings, Star, Trash2, WifiOff, LayoutGrid, Folder as FolderIcon } from "lucide-react";
import { buttonPrimary } from "@/components/ui/controls";
import type { BoardSummary, Folder } from "@/lib/sync/board-list-cache";
import { BoardCard } from "./BoardCard";
import { ConfirmFolderDelete, MoveDialog, NameDialog } from "./BoardDialogs";
import { FolderTree } from "./FolderTree";
import { ToastHost, useToast } from "./HomeToast";
import { NewBoardDialog, type NewBoardInput } from "./NewBoardDialog";
import { folderPath, viewBoards, type View } from "./library";
import { useLibrary } from "./useLibrary";

type DialogState =
  | { kind: "new-board" }
  | { kind: "rename-board"; board: BoardSummary }
  | { kind: "move-board"; board: BoardSummary }
  | { kind: "new-folder"; parentId: string | null }
  | { kind: "rename-folder"; folder: Folder }
  | { kind: "delete-folder"; folder: Folder };

const secondaryPill =
  "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-(length:--text-sm) font-medium text-fg-muted transition-[transform,background-color,color] duration-(--dur-fast) ease-out active:scale-[0.97] hoverable:bg-line hoverable:text-fg";

export function HomeApp({ localOnly }: { localOnly: boolean }) {
  const router = useRouter();
  const { toast, show, dismiss } = useToast();
  const { list, loaded, offline, readOnly, actions } = useLibrary({ localOnly, notify: show });
  const [view, setView] = useState<View>({ kind: "recent" });
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const closeDialog = () => setDialog(null);

  const searching = query.trim() !== "";
  const boards = viewBoards(list, view, query);
  const inTrash = view.kind === "trash";

  const title = searching
    ? `Results for “${query.trim()}”`
    : view.kind === "recent"
      ? "Recent"
      : view.kind === "starred"
        ? "Starred"
        : view.kind === "trash"
          ? "Trash"
          : folderPath(list.folders, view.id) || "Folder";

  async function create(input: NewBoardInput) {
    const id = await actions.createBoard(input);
    if (id) {
      closeDialog();
      router.push(`/b/${id}`);
    }
  }

  async function remove(b: BoardSummary) {
    if (await actions.trashBoard(b.id)) {
      show(`Deleted “${b.title}”`, { label: "Undo", run: () => void actions.restoreBoard(b.id) });
    }
  }

  async function duplicate(b: BoardSummary) {
    const outcome = await actions.duplicateBoard(b.id);
    if (outcome === "ok") show(`Duplicated “${b.title}”`);
    else if (outcome === "not-on-device") show(`Open “${b.title}” once on this device, then duplicate it.`);
    else show("Couldn't duplicate the board.");
  }

  const emptyCopy = (() => {
    if (searching) return { heading: `No boards match “${query.trim()}”`, body: inTrash ? "Nothing in the trash has that name." : "Try a different word, or clear the search." };
    if (view.kind === "starred") return { heading: "No starred boards", body: "Star a board from its menu to keep it close." };
    if (view.kind === "trash") return { heading: "Trash is empty", body: "Deleted boards stay here for 30 days, then they're gone for good." };
    if (view.kind === "folder") return { heading: "This folder is empty", body: "Move boards here from their menu, or create a new one." };
    return { heading: "No boards yet", body: "Create a board to start collecting references." };
  })();
  const EmptyIcon = inTrash ? Trash2 : view.kind === "starred" ? Star : view.kind === "folder" ? FolderIcon : LayoutGrid;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--z-overlay) border-b border-line bg-canvas">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <h1 className="sr-only">Atelier</h1>
          <Link href="/" aria-label="Atelier home" className="mr-auto shrink-0 rounded-md md:mr-0 md:w-52">
            <Image className="lockup-light h-7 w-auto" src="/brand/atelier-lockup-light.svg" alt="" width={83} height={28} priority unoptimized />
            <Image className="lockup-dark h-7 w-auto" src="/brand/atelier-lockup-dark.svg" alt="" width={83} height={28} priority unoptimized />
          </Link>

          <div className="order-last w-full md:order-none md:max-w-md md:flex-1">
            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                type="search"
                aria-label="Search boards"
                placeholder="Search boards"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                className="block min-h-11 w-full rounded-md border border-line bg-panel pl-9 pr-3 text-fg placeholder:text-fg-muted"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:ml-auto">
            {offline && !localOnly ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-(length:--text-sm) text-fg-muted">
                <WifiOff size={14} aria-hidden="true" />
                Offline
              </span>
            ) : null}
            <Link href="/settings" aria-label="Settings" className={`${secondaryPill} px-0 min-w-11 justify-center`}>
              <Settings size={18} aria-hidden="true" />
            </Link>
            <button type="button" className={buttonPrimary} disabled={readOnly} onClick={() => setDialog({ kind: "new-board" })}>
              <Plus size={18} aria-hidden="true" />
              New board
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:gap-8">
        <aside className="md:w-52 md:shrink-0">
          <div className="md:sticky md:top-24">
            <FolderTree
              view={view}
              folders={list.folders}
              disabled={readOnly}
              handlers={{
                onView: (v) => {
                  setView(v);
                  setQuery("");
                },
                onNewFolder: (parentId) => setDialog({ kind: "new-folder", parentId }),
                onRenameFolder: (folder) => setDialog({ kind: "rename-folder", folder }),
                onDeleteFolder: (folder) => setDialog({ kind: "delete-folder", folder }),
              }}
            />
            {localOnly ? (
              <p className="mt-6 hidden px-3 text-(length:--text-xs) text-fg-muted md:block">
                Local-only mode: your boards stay on this device.
              </p>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 flex-1" aria-labelledby="home-view-title">
          <h2 id="home-view-title" className="mb-5 truncate text-(length:--text-xl) font-semibold">
            {title}
          </h2>

          {!loaded ? (
            <p className="text-fg-muted">Loading your boards…</p>
          ) : boards.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-16 text-center">
              <EmptyIcon size={28} aria-hidden="true" className="mb-4 text-fg-muted" />
              <p className="text-(length:--text-lg) font-semibold">{emptyCopy.heading}</p>
              <p className="mt-1 max-w-sm text-fg-muted">{emptyCopy.body}</p>
              {!searching && (view.kind === "recent" || view.kind === "folder") ? (
                <button type="button" className={`${buttonPrimary} mt-6`} disabled={readOnly} onClick={() => setDialog({ kind: "new-board" })}>
                  <Plus size={18} aria-hidden="true" />
                  New board
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 2xl:grid-cols-4">
              {boards.map((b) => (
                <li key={b.id} className="min-w-0">
                  <BoardCard
                    board={b}
                    trash={inTrash}
                    disabled={readOnly}
                    handlers={{
                      onRename: (board) => setDialog({ kind: "rename-board", board }),
                      onDuplicate: (board) => void duplicate(board),
                      onMove: (board) => setDialog({ kind: "move-board", board }),
                      onToggleStar: (board) => void actions.setStarred(board.id, !board.starred),
                      onDelete: (board) => void remove(board),
                      onRestore: (board) => void actions.restoreBoard(board.id),
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      {dialog?.kind === "new-board" ? (
        <NewBoardDialog
          folders={list.folders}
          defaultFolderId={view.kind === "folder" ? view.id : null}
          onCreate={create}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === "rename-board" ? (
        <NameDialog
          heading="Rename board"
          label="Title"
          initial={dialog.board.title}
          submitLabel="Save"
          maxLength={300}
          onSubmit={(v) => void actions.renameBoard(dialog.board.id, v)}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === "move-board" ? (
        <MoveDialog
          boardTitle={dialog.board.title}
          folders={list.folders}
          currentFolderId={dialog.board.folderId}
          onSubmit={(folderId) => void actions.moveBoard(dialog.board.id, folderId)}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === "new-folder" ? (
        <NameDialog
          heading="New folder"
          label="Name"
          initial=""
          submitLabel="Create folder"
          maxLength={200}
          onSubmit={(v) => void actions.createFolder(v, dialog.parentId)}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === "rename-folder" ? (
        <NameDialog
          heading="Rename folder"
          label="Name"
          initial={dialog.folder.name}
          submitLabel="Save"
          maxLength={200}
          onSubmit={(v) => void actions.renameFolder(dialog.folder.id, v)}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === "delete-folder" ? (
        <ConfirmFolderDelete
          name={dialog.folder.name}
          onConfirm={() => {
            if (view.kind === "folder" && view.id === dialog.folder.id) setView({ kind: "recent" });
            void actions.deleteFolder(dialog.folder.id);
          }}
          onClose={closeDialog}
        />
      ) : null}

      <ToastHost toast={toast} onDismiss={dismiss} />
    </div>
  );
}
