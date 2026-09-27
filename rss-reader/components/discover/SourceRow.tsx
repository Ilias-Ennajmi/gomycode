"use client";

import {
  Check,
  ChevronDown,
  Loader2,
  Mail,
  Newspaper,
  Play,
  Plus,
  Rss,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DiscoverResult } from "@/lib/hooks/useDiscover";

export const KIND_META = {
  rss: { label: "Site", icon: Rss },
  youtube: { label: "YouTube", icon: Play },
  newsletter: { label: "Newsletter", icon: Mail },
} as const;

function sourceImage(result: DiscoverResult) {
  if (result.imageUrl) return result.imageUrl;
  if (result.kind === "youtube") return null;
  if (result.provider === "topic" && result.name.startsWith("“")) return null;
  try {
    const host =
      result.provider === "topic"
        ? result.name
        : new URL(result.siteUrl || result.url).hostname.replace(/^(www|feeds?|rss)\./, "");
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return null;
  }
}

function formatFollowers(result: DiscoverResult) {
  if (result.followersLabel) return result.followersLabel;
  const n = result.followers;
  if (!n || n < 50) return null;
  const short = n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : n;
  return `${String(short).replace(".0", "")} readers`;
}

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
}

interface SourceRowProps {
  result: DiscoverResult;
  following: boolean;
  pending: boolean;
  onFollow: () => void;
  /** Set once the follow is saved: which category it was filed under. */
  added?: { categoryId: string | null };
  categories?: CategoryOption[];
  onMove?: (categoryId: string | null) => void;
}

export function SourceRow({
  result,
  following,
  pending,
  onFollow,
  added,
  categories = [],
  onMove,
}: SourceRowProps) {
  const topic = result.provider === "topic";
  const { icon: KindIcon, label } = topic
    ? { icon: Newspaper, label: "News search" }
    : KIND_META[result.kind];
  const followers = formatFollowers(result);

  return (
    <li className="flex items-start gap-3 py-3">
      <div className="relative mt-0.5 shrink-0">
        {topic && !sourceImage(result) ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-border/60">
            <Newspaper className="h-5 w-5" />
          </span>
        ) : (
          <FeedFavicon
            title={result.name}
            faviconUrl={sourceImage(result)}
            size={40}
            className="rounded-xl ring-1 ring-border/60"
          />
        )}
        {!topic && (
          <span
            className={cn(
              "absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-background",
              result.kind === "youtube" ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
            )}
            aria-hidden
          >
            <KindIcon className="h-2.5 w-2.5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold leading-snug">{result.name}</p>
        {(result.reason || result.description) && (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            {result.reason ? (
              <>
                <Sparkles className="mr-1 inline h-3 w-3 -translate-y-px text-primary" />
                {result.reason}
              </>
            ) : (
              result.description
            )}
          </p>
        )}
        {added && onMove ? (
          <AddedTo categories={categories} categoryId={added.categoryId} onMove={onMove} />
        ) : (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
            <span>{label}</span>
            {result.lang && (
              <>
                <span aria-hidden>·</span>
                <span className="uppercase">{result.lang}</span>
              </>
            )}
            {followers && (
              <>
                <span aria-hidden>·</span>
                <span>{followers}</span>
              </>
            )}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onFollow}
        disabled={following || pending}
        aria-label={following ? `Following ${result.name}` : `Follow ${result.name}`}
        className={cn(
          "mt-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors",
          following
            ? "bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
        )}
      >
        {following ? (
          <Check className="h-3.5 w-3.5" />
        ) : pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {following ? "Following" : "Follow"}
      </button>
    </li>
  );
}

/** "Added to Tech & AI ▾": the category a new follow landed in, changeable in place. */
function AddedTo({
  categories,
  categoryId,
  onMove,
}: {
  categories: CategoryOption[];
  categoryId: string | null;
  onMove: (categoryId: string | null) => void;
}) {
  const current = categories.find((c) => c.id === categoryId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-medium text-primary hover:bg-primary/15">
        <Check className="h-3 w-3 shrink-0" />
        <span className="truncate">
          Added to {current ? current.name : "your feed"}
          <span className="text-primary/70"> · Change</span>
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
        {categories.map((category) => (
          <DropdownMenuItem
            key={category.id}
            onSelect={() => onMove(category.id)}
            className="gap-2"
            disabled={category.id === categoryId}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
              aria-hidden
            />
            <span className="truncate">{category.name}</span>
            {category.id === categoryId && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onMove(null)} disabled={categoryId === null}>
          No category
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
