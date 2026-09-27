"use client";

import * as React from "react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import type { NewsStory } from "@/lib/hooks/useNews";

/** A story picture that quietly disappears if the site refuses to serve it. */
export function StoryImage({
  src,
  className,
  alt = "",
}: {
  src: string | null;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) {
    return (
      <div className={cn("bg-gradient-to-br from-muted to-muted/40", className)} aria-hidden />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}

/** Overlapping outlet icons: "who covers this". */
export function SourceStack({
  story,
  max = 4,
  size = 18,
  ringClass = "ring-background",
}: {
  story: NewsStory;
  max?: number;
  size?: number;
  ringClass?: string;
}) {
  return (
    <span className="flex -space-x-1.5">
      {story.sources.slice(0, max).map((s) => (
        <FeedFavicon
          key={s.id}
          title={s.title}
          faviconUrl={s.faviconUrl}
          size={size}
          className={cn("rounded-full bg-background ring-2", ringClass)}
        />
      ))}
    </span>
  );
}

/** "Le Monde · 2h ago · +3 outlets", or "4 outlets · 2h ago" when compact. */
export function StoryMeta({
  story,
  className,
  compact = false,
}: {
  story: NewsStory;
  className?: string;
  compact?: boolean;
}) {
  const more = story.sources.length - 1;
  if (compact && more > 0) {
    return (
      <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <SourceStack story={story} max={3} size={14} ringClass="ring-card" />
        <span className="font-medium text-primary">{story.sources.length} outlets</span>
        <span aria-hidden>·</span>
        <time dateTime={story.publishedAt}>{formatRelativeTime(story.publishedAt)}</time>
      </p>
    );
  }
  return (
    <p className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <FeedFavicon title={story.source.title} faviconUrl={story.source.faviconUrl} size={14} />
      <span className="truncate font-medium">{story.source.title}</span>
      <span aria-hidden>·</span>
      <time dateTime={story.publishedAt} className="shrink-0">
        {formatRelativeTime(story.publishedAt)}
      </time>
      {more > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="shrink-0 font-medium text-primary">
            +{more} {more === 1 ? "outlet" : "outlets"}
          </span>
        </>
      )}
    </p>
  );
}
