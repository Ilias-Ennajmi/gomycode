"use client";

import { Check, Loader2, Mail, Play, Plus, Rss, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import type { DiscoverResult } from "@/lib/hooks/useDiscover";

export const KIND_META = {
  rss: { label: "Site", icon: Rss },
  youtube: { label: "YouTube", icon: Play },
  newsletter: { label: "Newsletter", icon: Mail },
} as const;

function sourceImage(result: DiscoverResult) {
  if (result.imageUrl) return result.imageUrl;
  if (result.kind === "youtube") return null;
  try {
    const host = new URL(result.siteUrl || result.url).hostname.replace(/^(www|feeds?|rss)\./, "");
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

interface SourceRowProps {
  result: DiscoverResult;
  following: boolean;
  pending: boolean;
  onFollow: () => void;
}

export function SourceRow({ result, following, pending, onFollow }: SourceRowProps) {
  const { icon: KindIcon, label } = KIND_META[result.kind];
  const followers = formatFollowers(result);

  return (
    <li className="flex items-start gap-3 py-3">
      <div className="relative mt-0.5 shrink-0">
        <FeedFavicon
          title={result.name}
          faviconUrl={sourceImage(result)}
          size={40}
          className="rounded-xl ring-1 ring-border/60"
        />
        <span
          className={cn(
            "absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-background",
            result.kind === "youtube" ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
          )}
          aria-hidden
        >
          <KindIcon className="h-2.5 w-2.5" />
        </span>
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
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : following ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {following ? "Following" : "Follow"}
      </button>
    </li>
  );
}
