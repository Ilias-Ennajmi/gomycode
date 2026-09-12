"use client";

import * as React from "react";
import { AlertTriangle, CheckCheck, FolderInput, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { deleteFeed, markAllRead, updateFeed } from "@/lib/hooks/useFeeds";
import type { CategorySummary } from "@/lib/types";
import { toast } from "sonner";

interface FeedItemProps {
  id: string;
  title: string;
  faviconUrl?: string | null;
  unreadCount: number;
  errorCount: number;
  active: boolean;
  categories: CategorySummary[];
  onClick: () => void;
  onChanged: () => void;
}

export function FeedItem({
  id,
  title,
  faviconUrl,
  unreadCount,
  errorCount,
  active,
  categories,
  onClick,
  onChanged,
}: FeedItemProps) {
  const [renaming, setRenaming] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(title);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  async function commitRename() {
    setRenaming(false);
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === title) {
      setDraftTitle(title);
      return;
    }
    try {
      await updateFeed(id, { title: trimmed });
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename feed");
      setDraftTitle(title);
    }
  }

  async function handleMoveToCategory(categoryId: string | null) {
    try {
      await updateFeed(id, { categoryId });
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move feed");
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead({ feedId: id });
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark feed read");
    }
  }

  async function handleDelete() {
    try {
      await deleteFeed(id);
      toast.success(`Removed ${title}`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete feed");
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            onDoubleClick={() => setRenaming(true)}
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-md border-l-2 border-transparent py-1.5 pl-6 pr-2.5 text-sm transition-colors",
              active
                ? "border-primary bg-accent font-medium text-accent-foreground"
                : "text-foreground/80 hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <FeedFavicon title={title} faviconUrl={faviconUrl} size={16} />
            {renaming ? (
              <Input
                ref={inputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setDraftTitle(title);
                    setRenaming(false);
                  }
                }}
                className="h-6 flex-1 px-1 py-0 text-sm"
                autoFocus
              />
            ) : (
              <span className="flex-1 truncate text-left">{title}</span>
            )}
            {errorCount >= 5 && (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Feed is failing" />
            )}
            {!!unreadCount && (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 shrink-0 justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuPortal>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onSelect={() => setRenaming(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <FolderInput className="mr-2 h-3.5 w-3.5" /> Move to category
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => handleMoveToCategory(null)}>
                  Uncategorized
                </ContextMenuItem>
                {categories.map((category) => (
                  <ContextMenuItem
                    key={category.id}
                    onSelect={() => handleMoveToCategory(category.id)}
                  >
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem onSelect={handleMarkAllRead}>
              <CheckCheck className="mr-2 h-3.5 w-3.5" /> Mark all read
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => setConfirmDelete(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${title}?`}
        description="This will remove the feed and all of its articles. This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </>
  );
}
