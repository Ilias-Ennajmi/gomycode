"use client";

import * as React from "react";
import useSWR from "swr";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  Check,
  Headphones,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  Rss,
  X,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { durationLabel } from "@/lib/hooks/useVideo";
import { useAudio } from "@/components/audio/AudioProvider";
import { Art } from "@/components/media/MediaCards";
import type { DiscoverResult } from "@/lib/hooks/useDiscover";
import type { SourcePreview as Preview, SourcePreviewItem } from "@/app/api/discover/preview/route";

const KIND_LABEL = {
  rss: "Site",
  youtube: "YouTube channel",
  newsletter: "Newsletter",
  podcast: "Podcast",
} as const;

/**
 * A look inside a source before following it: the cover, what it's about, how often it
 * publishes, and its latest episodes, videos or posts. Follow from here, or close and keep
 * browsing. Episodes can be played as a sample right away.
 */
export function SourcePreview({
  result,
  following,
  pending,
  onFollow,
  onClose,
  manage,
}: {
  result: DiscoverResult;
  following: boolean;
  pending: boolean;
  onFollow: () => void;
  onClose: () => void;
  /** For a source already followed: its own buttons (open, mute, unfollow…). */
  manage?: React.ReactNode;
}) {
  const { data, error, isLoading } = useSWR<Preview>(
    `/api/discover/preview?url=${encodeURIComponent(result.url)}&kind=${result.kind}`,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const [more, setMore] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  // A callback ref: the pop-up's portal mounts its content a moment after the first render.
  const [descriptionNode, setDescriptionNode] = React.useState<HTMLParagraphElement | null>(null);
  const kind = data?.type ?? result.kind;
  const cover = data?.coverUrl ?? result.imageUrl ?? null;
  const description = data?.description || result.description || null;
  const isFollowing = following || Boolean(data?.followedFeedId);
  const round = kind === "youtube";
  // Measured again whenever the box changes size (fonts, the pop-up settling), so "see
  // more" shows exactly when the text is cut.
  React.useEffect(() => {
    const node = descriptionNode;
    if (!node || more) return;
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [descriptionNode, description, more]);

  const stats = [
    KIND_LABEL[kind],
    (data?.language ?? result.lang)?.toUpperCase(),
    data?.perWeek
      ? data.perWeek >= 1
        ? `about ${data.perWeek} a week`
        : `about ${Math.max(1, Math.round(data.perWeek * 4.3))} a month`
      : null,
    data?.lastPublished ? `latest ${formatRelativeTime(data.lastPublished)}` : null,
    result.followersLabel ?? null,
  ].filter(Boolean);

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 top-8 z-[60] flex flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl data-[state=open]:animate-rise-in",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(88vh,820px)] sm:w-[min(94vw,600px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border"
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* The cover, blown up and blurred, as the header's light. */}
            <div className="relative overflow-hidden px-5 pb-5 pt-6">
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt=""
                  aria-hidden
                  referrerPolicy="no-referrer"
                  className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl saturate-150"
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-background" />
              <DialogPrimitive.Close
                aria-label="Close"
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/70 backdrop-blur hover:bg-background"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
              <div className="relative flex flex-col items-center text-center">
                <Art
                  src={cover}
                  name={data?.title ?? result.name}
                  icon={kind === "podcast" ? Headphones : kind === "newsletter" ? Mail : Rss}
                  className={cn(
                    "h-36 w-36 text-5xl shadow-2xl ring-1 ring-white/10",
                    round ? "rounded-full" : "rounded-2xl"
                  )}
                />
                <DialogPrimitive.Title className="mt-4 text-balance text-2xl font-bold leading-tight tracking-tight">
                  {data?.title ?? result.name}
                </DialogPrimitive.Title>
                <p className="mt-1.5 text-xs text-muted-foreground">{stats.join(" · ")}</p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onFollow}
                    disabled={isFollowing || pending}
                    className={cn(
                      "flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold transition-transform active:scale-95",
                      isFollowing
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {isFollowing ? (
                      <Check className="h-4 w-4" />
                    ) : pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {isFollowing ? "Following" : "Follow"}
                  </button>
                  {(data?.siteUrl || result.siteUrl) && (
                    <a
                      href={data?.siteUrl ?? result.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-border hover:bg-accent"
                    >
                      Website <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                {manage && <div className="mt-3 w-full">{manage}</div>}
              </div>
            </div>

            <div className="px-5 pb-safe">
              {description && (
                <div className="mb-5">
                  <p
                    ref={setDescriptionNode}
                    className={cn(
                      "whitespace-pre-line text-sm leading-relaxed text-muted-foreground",
                      !more && "line-clamp-4"
                    )}
                  >
                    {description}
                  </p>
                  {(overflows || more) && (
                    <button
                      type="button"
                      onClick={() => setMore((v) => !v)}
                      className="mt-1 text-sm font-semibold hover:underline"
                    >
                      {more ? "see less" : "… see more"}
                    </button>
                  )}
                </div>
              )}

              <h3 className="mb-2 text-[15px] font-bold tracking-tight">
                {kind === "podcast"
                  ? "Latest episodes"
                  : kind === "youtube"
                    ? "Latest videos"
                    : "Latest posts"}
              </h3>
              {isLoading && (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Looking inside…
                </div>
              )}
              {error && (
                <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                  {(error as Error).message || "Couldn't load a preview right now."} You can still
                  follow it.
                </p>
              )}
              {data && data.items.length === 0 && (
                <p className="py-6 text-sm text-muted-foreground">Nothing published yet.</p>
              )}
              {data && kind === "youtube" ? (
                <ul className="grid grid-cols-2 gap-3 pb-6">
                  {data.items.map((item) => (
                    <VideoItem key={item.link} item={item} />
                  ))}
                </ul>
              ) : data ? (
                <ul className="divide-y pb-6">
                  {data.items.map((item) =>
                    item.audioUrl ? (
                      <EpisodeItem
                        key={item.link + item.audioUrl}
                        item={item}
                        show={data.title}
                        cover={cover}
                        feedUrl={data.feedUrl}
                      />
                    ) : (
                      <PostItem key={item.link} item={item} />
                    )
                  )}
                </ul>
              ) : null}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function EpisodeItem({
  item,
  show,
  cover,
  feedUrl,
}: {
  item: SourcePreviewItem;
  show: string;
  cover: string | null;
  feedUrl: string;
}) {
  const audio = useAudio();
  const id = `ext:${item.audioUrl}#${item.publishedAt}`;
  const current = audio.episode?.id === id;
  const playing = current && audio.playing;
  return (
    <li className="flex items-start gap-3 py-3">
      <button
        type="button"
        onClick={() => {
          if (current) audio.toggle();
          else
            audio.play({
              id,
              title: item.title,
              feedId: "ext",
              feedTitle: show,
              imageUrl: item.imageUrl ?? cover,
              audioUrl: item.audioUrl!,
              durationSeconds: item.durationSeconds,
              feedUrl,
            });
        }}
        aria-label={playing ? `Pause ${item.title}` : `Play ${item.title}`}
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.title}</p>
        {item.summary && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
            {item.summary}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatRelativeTime(item.publishedAt)}
          {item.durationSeconds ? ` · ${durationLabel(item.durationSeconds)}` : ""}
        </p>
      </div>
    </li>
  );
}

function VideoItem({ item }: { item: SourcePreviewItem }) {
  return (
    <li>
      <a href={item.link} target="_blank" rel="noopener noreferrer" className="group block">
        <span className="relative block aspect-video overflow-hidden rounded-xl bg-muted">
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
        </span>
        <span className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug">
          {item.title}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {formatRelativeTime(item.publishedAt)}
        </span>
      </a>
    </li>
  );
}

function PostItem({ item }: { item: SourcePreviewItem }) {
  return (
    <li>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 py-3 hover:opacity-90"
      >
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.title}</p>
          {item.summary && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
              {item.summary}
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatRelativeTime(item.publishedAt)}
          </p>
        </div>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            className="h-16 w-20 shrink-0 rounded-lg object-cover"
          />
        )}
      </a>
    </li>
  );
}
