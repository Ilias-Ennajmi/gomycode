"use client";

import { useState } from "react";
import { ChevronDown, Clock, Folder as FolderIcon, FolderPlus, Pencil, Star, Trash2 } from "lucide-react";
import type { Folder } from "@/lib/sync/board-list-cache";
import { ActionMenu } from "./ActionMenu";
import { buildFolderTree, folderPath, type FolderNode, type View } from "./library";

const sameView = (a: View, b: View) => a.kind === b.kind && (a.kind !== "folder" || (b.kind === "folder" && a.id === b.id));

const rowBase =
  "flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-3 text-left text-(length:--text-md) transition-[background-color,transform] duration-(--dur-fast) ease-out active:scale-[0.98] pointer-coarse:min-h-11 hoverable:bg-line";

export type TreeHandlers = {
  onView: (v: View) => void;
  onNewFolder: (parentId: string | null) => void;
  onRenameFolder: (f: Folder) => void;
  onDeleteFolder: (f: Folder) => void;
};

function Row({ view, current, label, icon: Icon, onView, aside, depth = 0 }: {
  view: View;
  current: View;
  label: string;
  icon: typeof Clock;
  onView: (v: View) => void;
  aside?: React.ReactNode;
  depth?: number;
}) {
  const active = sameView(view, current);
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={() => onView(view)}
        className={`${rowBase} ${active ? "bg-(--color-selection-fill) font-medium text-brand" : "text-fg"}`}
        style={{ paddingInlineStart: `calc(var(--space-3) + ${depth} * var(--space-4))` }}
      >
        <Icon size={16} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {aside}
    </li>
  );
}

function Nodes({ nodes, current, handlers, disabled }: { nodes: FolderNode[]; current: View; handlers: TreeHandlers; disabled: boolean }) {
  return nodes.map((n) => (
    <FolderRowGroup key={n.folder.id} node={n} current={current} handlers={handlers} disabled={disabled} />
  ));
}

function FolderRowGroup({ node, current, handlers, disabled }: { node: FolderNode; current: View; handlers: TreeHandlers; disabled: boolean }) {
  const f = node.folder;
  return (
    <>
      <Row
        view={{ kind: "folder", id: f.id }}
        current={current}
        label={f.name}
        icon={FolderIcon}
        depth={node.depth}
        onView={handlers.onView}
        aside={
          <ActionMenu
            label={`Actions for folder ${f.name}`}
            disabled={disabled}
            items={[
              { label: "Rename", icon: Pencil, onSelect: () => handlers.onRenameFolder(f) },
              { label: "New subfolder", icon: FolderPlus, onSelect: () => handlers.onNewFolder(f.id) },
              { label: "Delete", icon: Trash2, onSelect: () => handlers.onDeleteFolder(f), danger: true },
            ]}
          />
        }
      />
      <Nodes nodes={node.children} current={current} handlers={handlers} disabled={disabled} />
    </>
  );
}

/**
 * Recent / Starred / Folders / Trash. On a phone it folds into one button showing where you are;
 * from the medium breakpoint up it is always open beside the grid.
 */
export function FolderTree({ view, folders, handlers, disabled }: { view: View; folders: Folder[]; handlers: TreeHandlers; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const tree = buildFolderTree(folders);
  const here =
    view.kind === "recent" ? "Recent" : view.kind === "starred" ? "Starred" : view.kind === "trash" ? "Trash" : folderPath(folders, view.id) || "Folder";
  const go = (v: View) => {
    handlers.onView(v);
    setOpen(false);
  };

  return (
    <nav aria-label="Boards">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="home-nav-list"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between rounded-md border border-line bg-panel px-3 text-(length:--text-md) font-medium md:hidden"
      >
        <span className="truncate">{here}</span>
        <ChevronDown size={16} aria-hidden="true" className={`transition-transform duration-(--dur-fast) ease-out ${open ? "rotate-180" : ""}`} />
      </button>

      <div id="home-nav-list" className={`${open ? "mt-2 block" : "hidden"} md:mt-0 md:block`}>
        <ul className="flex flex-col gap-0.5">
          <Row view={{ kind: "recent" }} current={view} label="Recent" icon={Clock} onView={go} />
          <Row view={{ kind: "starred" }} current={view} label="Starred" icon={Star} onView={go} />
        </ul>

        <div className="mb-1 mt-5 flex items-center justify-between pl-3">
          <h2 className="text-(length:--text-xs) font-semibold uppercase tracking-wide text-fg-muted">Folders</h2>
          <button
            type="button"
            aria-label="New folder"
            disabled={disabled}
            onClick={() => handlers.onNewFolder(null)}
            className="inline-flex min-h-(--target-min) min-w-(--target-min) items-center justify-center rounded-md text-fg-muted transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11 hoverable:bg-line hoverable:text-fg"
          >
            <FolderPlus size={16} aria-hidden="true" />
          </button>
        </div>
        {tree.length === 0 ? (
          <p className="px-3 pb-1 text-(length:--text-sm) text-fg-muted">No folders yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            <Nodes
              nodes={tree}
              current={view}
              handlers={{ ...handlers, onView: go }}
              disabled={disabled}
            />
          </ul>
        )}

        <ul className="mt-5 flex flex-col gap-0.5 border-t border-line pt-3">
          <Row view={{ kind: "trash" }} current={view} label="Trash" icon={Trash2} onView={go} />
        </ul>
      </div>
    </nav>
  );
}
