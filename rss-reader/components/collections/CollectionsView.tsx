"use client";

import * as React from "react";
import {
  BookDown,
  Copy,
  FolderOpen,
  Globe,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useReaderState } from "@/lib/hooks/useReaderState";
import {
  deleteCollection,
  updateCollection,
  useCollections,
  type CollectionSummary,
} from "@/lib/hooks/useCollections";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Later → Collections: your named sets of saved articles as cards with a four-picture
 * cover. Open one to read it; publish it to get a link anyone can open.
 */
export function CollectionsView() {
  const { collections, isLoading } = useCollections();
  const { setView } = useReaderState();
  if (!isLoading && collections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-16 text-center text-muted-foreground">
        <FolderOpen className="h-10 w-10" />
        <p className="max-w-xs text-sm">
          No collections yet. Long-press any article (or use the reader&rsquo;s menu) and choose
          &ldquo;Add to collection&rdquo; to start one.
        </p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
      {collections.map((c) => (
        <CollectionCard
          key={c.id}
          collection={c}
          onOpen={() => setView({ type: "collection", id: c.id, label: c.name })}
        />
      ))}
    </ul>
  );
}

function CollectionCard({
  collection: c,
  onOpen,
}: {
  collection: CollectionSummary;
  onOpen: () => void;
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(c.name);
  const link = c.slug
    ? `${typeof window === "undefined" ? "" : window.location.origin}/c/${c.slug}`
    : null;

  async function publish(next: boolean) {
    try {
      const updated = await updateCollection(c.id, { public: next });
      if (next && updated.slug) {
        const url = `${window.location.origin}/c/${updated.slug}`;
        await navigator.clipboard.writeText(url).catch(() => undefined);
        toast.success("Published", { description: "Link copied. Anyone with it can read." });
      } else toast.success("Made private", { description: "The old link no longer works." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    }
  }

  async function rename() {
    const trimmed = name.trim();
    setRenaming(false);
    if (!trimmed || trimmed === c.name) return;
    try {
      await updateCollection(c.id, { name: trimmed });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work");
    }
  }

  return (
    <li className="group relative overflow-hidden rounded-2xl border bg-card/60 shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="grid aspect-[2/1] grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-muted">
          {[0, 1, 2, 3].map((i) =>
            c.covers[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={c.covers[i]}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <span key={i} className={cn("block", i % 2 ? "bg-primary/10" : "bg-primary/5")} />
            )
          )}
        </span>
        <span className="block p-3.5">
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={rename}
              onKeyDown={(event) => {
                if (event.key === "Enter") rename();
                if (event.key === "Escape") setRenaming(false);
              }}
              onClick={(event) => event.stopPropagation()}
              aria-label="Collection name"
              className="h-8 w-full rounded-md border bg-background px-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/40"
            />
          ) : (
            <span className="block truncate text-[15px] font-semibold">{c.name}</span>
          )}
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {c.count} article{c.count === 1 ? "" : "s"}
            {c.slug ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <Globe className="h-3 w-3" /> public
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> private
              </span>
            )}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${c.name}`}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow backdrop-blur hover:bg-background"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => void publish(!c.slug)} className="gap-2">
            {c.slug ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            {c.slug ? "Make private" : "Publish as a page"}
          </DropdownMenuItem>
          {link && (
            <DropdownMenuItem
              onSelect={() =>
                navigator.clipboard
                  .writeText(link)
                  .then(() => toast.success("Link copied"))
                  .catch(() => toast.error("Couldn't copy"))
              }
              className="gap-2"
            >
              <Copy className="h-4 w-4" /> Copy link
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className="gap-2">
            <a href={`/api/later/epub?collection=${c.id}`} download>
              <BookDown className="h-4 w-4" /> Download as EPUB
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setName(c.name);
              setRenaming(true);
            }}
            className="gap-2"
          >
            <Pencil className="h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              deleteCollection(c.id)
                .then(() => toast.success("Collection removed"))
                .catch(() => toast.error("Couldn't remove it"))
            }
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete collection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
