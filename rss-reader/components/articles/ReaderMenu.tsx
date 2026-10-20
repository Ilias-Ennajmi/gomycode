"use client";

import {
  BookOpen,
  ExternalLink,
  Eye,
  Focus,
  FolderPlus,
  MoreHorizontal,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReaderPrefs } from "@/lib/hooks/useReaderPrefs";
import { useComfort } from "@/lib/hooks/useComfort";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ArticleSummary } from "@/lib/types";

/**
 * The reader's ⋯ menu: how to read this (a scroll or pages, bionic, focus) and the less
 * frequent actions (collections, the original), so the toolbar keeps only the daily ones.
 */
export function ReaderMenu({
  article,
  media,
  onCollect,
  className,
}: {
  article: ArticleSummary;
  media: boolean;
  onCollect: () => void;
  className?: string;
}) {
  const { prefs, update } = useReaderPrefs();
  const { comfort, update: updateComfort } = useComfort();
  const paged = prefs.mode === "pages";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More options"
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent",
            className
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {!media && (
          <>
            <DropdownMenuLabel className="text-xs">Read as</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => update({ mode: paged ? "scroll" : "pages" })}
              className="gap-2"
            >
              {paged ? <ScrollText className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              {paged ? "A scroll" : "Pages, like a book"}
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={comfort.bionic}
              onCheckedChange={(on) => updateComfort({ bionic: on })}
            >
              <Eye className="mr-2 h-4 w-4" /> Bionic reading
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={prefs.focus}
              onCheckedChange={(on) => update({ focus: on })}
            >
              <Focus className="mr-2 h-4 w-4" /> Focus mode
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={onCollect} className="gap-2">
          <FolderPlus className="h-4 w-4" /> Add to collection
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <a href={article.link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> Open original
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
