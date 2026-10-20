"use client";

import * as React from "react";
import { Check, FolderPlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { haptic } from "@/lib/native";
import {
  addToCollection,
  createCollection,
  removeFromCollection,
  useCollections,
} from "@/lib/hooks/useCollections";

/**
 * "Add to collection": a list of collections to tick, and a line to make a new one. Ticking
 * a collection also saves the article to Later, so a collection is always a set of kept
 * articles.
 */
export function CollectionPicker({
  articleId,
  open,
  onOpenChange,
}: {
  articleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { collections, isLoading } = useCollections(open ? articleId : null);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function toggle(id: string, inside: boolean) {
    setBusy(id);
    haptic();
    try {
      if (inside) await removeFromCollection(id, articleId);
      else await addToCollection(id, articleId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy("new");
    try {
      await createCollection(trimmed, articleId);
      setName("");
      haptic("success");
      toast.success(`Added to “${trimmed}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogTitle className="px-4 pb-2 pt-4 text-base font-semibold">
          Add to collection
        </DialogTitle>
        <ul className="max-h-[50vh] overflow-y-auto border-y">
          {isLoading && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            </li>
          )}
          {!isLoading && collections.length === 0 && (
            <li className="px-4 py-5 text-sm text-muted-foreground">
              No collections yet. Name one below to start it with this article.
            </li>
          )}
          {collections.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={Boolean(c.has)}
                disabled={busy === c.id}
                onClick={() => void toggle(c.id, Boolean(c.has))}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/60"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    c.has ? "border-primary bg-primary text-primary-foreground" : "bg-background"
                  )}
                >
                  {busy === c.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : c.has ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.count} article{c.count === 1 ? "" : "s"}
                    {c.slug ? " · public" : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex items-center gap-2 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <FolderPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New collection…"
            aria-label="New collection name"
            className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            disabled={!name.trim() || busy === "new"}
            aria-label="Create"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            {busy === "new" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
