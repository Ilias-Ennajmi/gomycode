"use client";

import * as React from "react";
import {
  ChevronDown,
  FileText,
  FolderPlus,
  GripVertical,
  Headphones,
  ListEnd,
  ListMusic,
  ListStart,
  ListVideo,
  MoreHorizontal,
  Play,
  Scissors,
  Share,
  SkipForward,
  Sparkles,
  Text,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { clock, durationLabel, useVideoExtras } from "@/lib/hooks/useVideo";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { haptic } from "@/lib/native";
import {
  AUDIO_RATES,
  episodeOf,
  resumePoint,
  useAudio,
  type Episode,
} from "@/components/audio/AudioProvider";
import { useArticle } from "@/lib/hooks/useArticles";
import { useArticleHighlights } from "@/lib/hooks/useHighlights";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { shareLink } from "@/lib/share";
import { isSnip } from "@/lib/snips";
import { SnipCard } from "@/components/audio/EpisodeNotes";
import { CollectionPicker } from "@/components/collections/CollectionPicker";
import {
  AboutCard,
  Art,
  DiscussionCard,
  MediaCard,
  MediaRow,
  ReadAlongCard,
  TimeListCard,
  staticTime,
} from "@/components/media/MediaCards";
import type { ArticleSummary } from "@/lib/types";
import {
  PlayPauseButton,
  SkipButton,
  SleepButton,
  SnipButton,
  SpeedButton,
  usePlayerTime,
} from "@/components/audio/PlayerControls";
import { SNIP_WINDOWS, useSnipWindow } from "@/lib/snips";
import { useSkipSponsors } from "@/lib/hooks/useSponsors";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The full-screen player, laid out like a podcast app's: the artwork, the title, a scrubber
 * with chapter marks and the chapter playing, the controls; then, as you scroll, cards that
 * fold shut: read along, chapters, key moments, your snips, about the episode, about the
 * show, up next, more from the show, similar episodes, discussion. Opens from the bar at the
 * bottom, or from an episode tapped in a list (shown, not playing, until Play).
 * Swipe down from the top, or tap the chevron, to shrink it back to the bar.
 */
export function NowPlayingSheet() {
  const audio = useAudio();
  const { episode, viewing, expanded, setExpanded } = audio;
  const shown = viewing ?? episode;
  const isCurrent = Boolean(shown && episode && shown.id === episode.id);
  const close = React.useCallback(() => setExpanded(false), [setExpanded]);
  useBackToClose(expanded && Boolean(shown), close);
  // Escape closes it too, unless a menu or pop-up is open over it (Escape is theirs).
  React.useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="menu"], [role="dialog"][data-state="open"]')) return;
      close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, close]);
  const { setSelectedArticleId, setMobilePane } = useReaderState();

  const external = shown?.id.startsWith("ext:") ?? false;
  const liveId = expanded && shown && !external ? shown.id : null;
  const { extras } = useVideoExtras(liveId);
  const { article } = useArticle(liveId);
  const { highlights } = useArticleHighlights(liveId);
  const snips = highlights.filter(isSnip);
  const savedAt = shown
    ? resumePoint({
        watchedSeconds: article?.watchedSeconds ?? shown.watchedSeconds ?? 0,
        durationSeconds: article?.durationSeconds ?? shown.durationSeconds,
      })
    : 0;
  const idleStore = React.useMemo(() => staticTime(savedAt), [savedAt]);
  const store = isCurrent ? audio.time : idleStore;
  const seek = React.useCallback(
    (seconds: number) => {
      if (!shown) return;
      if (isCurrent) audio.seek(seconds);
      else audio.play(shown, seconds);
    },
    [audio, isCurrent, shown]
  );
  const openArticle = React.useCallback(
    (next: ArticleSummary) => {
      const asEpisode = episodeOf(next);
      if (asEpisode && !next.isVideo) {
        audio.openPlayer(asEpisode);
        return;
      }
      close();
      setSelectedArticleId(next.id);
      setMobilePane("reader");
    },
    [audio, close, setMobilePane, setSelectedArticleId]
  );
  const openEpisodePage = React.useCallback(() => {
    if (!shown || external) return;
    close();
    setSelectedArticleId(shown.id);
    setMobilePane("reader");
  }, [close, external, setMobilePane, setSelectedArticleId, shown]);

  // The page scrolls as one: the header turns into a small bar with the play button once
  // the big controls have scrolled away.
  const scroller = React.useRef<HTMLDivElement>(null);
  const [compact, setCompact] = React.useState(false);
  React.useEffect(() => {
    if (!expanded) return;
    scroller.current?.scrollTo({ top: 0 });
    setCompact(false);
  }, [expanded, shown?.id]);

  // Swipe down from the top of the page to close.
  const [dy, setDy] = React.useState(0);
  const drag = React.useRef<{ y: number; atTop: boolean } | null>(null);

  if (!shown) return null;
  const open = expanded;
  const chapters = extras?.chapters ?? [];
  const date = article?.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 overflow-hidden bg-background text-foreground transition-transform duration-300 ease-out",
        open ? "translate-y-0" : "pointer-events-none translate-y-full"
      )}
      style={dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined}
      role="dialog"
      aria-modal={open}
      aria-label={isCurrent ? "Now playing" : shown.title}
      inert={open ? undefined : true}
    >
      {/* The artwork, blown up and blurred, as the room's light. */}
      {shown.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shown.imageUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] w-full scale-125 object-cover opacity-35 blur-3xl saturate-150"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/10 via-background/80 to-background" />

      <div
        ref={scroller}
        data-scroll
        className="relative h-full overflow-y-auto overscroll-contain scrollbar-none"
        onScroll={(event) => setCompact(event.currentTarget.scrollTop > 380)}
        onTouchStart={(event) => {
          drag.current = {
            y: event.touches[0].clientY,
            atTop: event.currentTarget.scrollTop <= 0,
          };
        }}
        onTouchMove={(event) => {
          const d = drag.current;
          if (!d?.atTop) return;
          const my = event.touches[0].clientY - d.y;
          if (my > 0) setDy(my);
        }}
        onTouchEnd={() => {
          const moved = dy;
          drag.current = null;
          setDy(0);
          if (moved > 120) close();
        }}
      >
        <header
          className={cn(
            "sticky top-0 z-20 pt-safe transition-colors duration-200",
            compact && "border-b bg-background/90 backdrop-blur"
          )}
        >
          <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-2">
            <button
              type="button"
              onClick={close}
              aria-label="Minimize the player"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-accent/60"
            >
              <ChevronDown className="h-6 w-6" />
            </button>
            {compact ? (
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <Art src={shown.imageUrl} name={shown.feedTitle} className="h-9 w-9 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {shown.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {shown.feedTitle}
                  </span>
                </span>
                {isCurrent ? (
                  <PlayPauseButton size="sm" />
                ) : (
                  <button
                    type="button"
                    onClick={() => audio.play(shown, savedAt)}
                    aria-label={`Play ${shown.title}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background"
                  >
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </button>
                )}
              </div>
            ) : (
              <p className="min-w-0 flex-1 text-center leading-tight">
                <span className="block text-[11px] text-muted-foreground">
                  {isCurrent ? "Playing from podcast" : "Podcast episode"}
                </span>
                <span className="block truncate text-sm font-semibold">{shown.feedTitle}</span>
              </p>
            )}
            <PlayerMenu episode={shown} current={isCurrent} onEpisodePage={openEpisodePage} />
          </div>
        </header>

        <div className="mx-auto max-w-xl px-5 pb-safe">
          <section aria-label="Player" className="flex flex-col items-center pt-3">
            <Artwork episode={shown} current={isCurrent} />
            <div className="mt-6 flex w-full items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 text-xl font-bold leading-snug tracking-tight">
                  {shown.title}
                </h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {shown.feedTitle}
                  {date ? ` · ${date}` : ""}
                </p>
              </div>
              {isCurrent && <NextChapterButton chapters={chapters} />}
            </div>

            {isCurrent ? (
              <div className="mt-4 w-full">
                <ChapterScrubber chapters={chapters} />
                <div className="mt-3 flex items-center justify-between">
                  <SpeedButton />
                  <div className="flex items-center gap-3">
                    <SkipButton seconds={-15} />
                    <PlayPauseButton className="h-16 w-16" />
                    <SkipButton seconds={30} />
                  </div>
                  <SleepButton />
                </div>
              </div>
            ) : (
              <IdleControls episode={shown} savedAt={savedAt} />
            )}

            <div className="mt-4 flex w-full items-center justify-between text-muted-foreground">
              <div className="flex items-center gap-1">
                {!external && (
                  <ActionButton label="Episode page" onClick={openEpisodePage}>
                    <FileText className="h-5 w-5" />
                  </ActionButton>
                )}
                {!external && <CollectButton articleId={shown.id} />}
              </div>
              <div className="flex items-center gap-1">
                {isCurrent && <SnipButton />}
                <ActionButton
                  label="Share"
                  onClick={() =>
                    isCurrent
                      ? void audio.shareMoment()
                      : void shareLink(shown.title, article?.link ?? shown.audioUrl)
                  }
                >
                  <Share className="h-5 w-5" />
                </ActionButton>
                <ActionButton
                  label="Up next"
                  onClick={() =>
                    scroller.current
                      ?.querySelector('[data-card="up-next"]')
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                >
                  <ListMusic className="h-5 w-5" />
                </ActionButton>
              </div>
            </div>
          </section>

          <div className="mt-6 space-y-3 pb-10">
            {extras?.ai === "pending" && (
              <p className="rounded-2xl bg-card/85 px-4 py-3 text-sm text-muted-foreground ring-1 ring-border/60">
                The transcript, chapters and key moments are on their way: Gemini is listening to
                the episode.
              </p>
            )}
            <ReadAlongCard
              transcript={extras?.transcript ?? []}
              duration={shown.durationSeconds}
              store={store}
              onSeek={seek}
            />
            <TimeListCard
              id="chapters"
              title="Chapters"
              icon={ListVideo}
              items={chapters.map((c) => ({ t: c.t, label: c.title }))}
              store={store}
              onSeek={seek}
              artwork={shown.imageUrl}
            />
            <TimeListCard
              id="key-moments"
              title="Key moments"
              icon={Sparkles}
              items={(extras?.keyMoments ?? []).map((m) => ({ t: m.t, label: m.text }))}
              store={store}
              onSeek={seek}
            />
            {article && snips.length > 0 && (
              <MediaCard id="snips" title={`Your snips · ${snips.length}`} icon={Scissors}>
                <ul className="space-y-2">
                  {snips.map((snip) => (
                    <SnipCard key={snip.id} snip={snip} article={article} onSeek={seek} />
                  ))}
                </ul>
              </MediaCard>
            )}
            {!external && (
              <AboutCard
                id="about-episode"
                title="About the episode"
                meta={
                  <>
                    <p className="font-semibold leading-snug">{shown.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[date, shown.durationSeconds ? durationLabel(shown.durationSeconds) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </>
                }
                html={article?.content || article?.summary}
                onSeek={seek}
              />
            )}
            <ShowCard
              episode={shown}
              onOpenShow={() => {
                close();
                setMobilePane("list");
              }}
            />
            <MediaCard id="up-next" title="Up next" icon={ListMusic}>
              {audio.queue.length > 0 ? (
                <QueueList />
              ) : extras?.upNext ? (
                <SuggestedNext article={extras.upNext} onOpen={openArticle} />
              ) : (
                <Empty text="Nothing queued. Long-press an episode and choose “Play next” or “Add to queue”." />
              )}
            </MediaCard>
            {!external && (
              <MediaRow
                id="more-from-show"
                title={`More from ${shown.feedTitle}`}
                url={`/api/articles?feedId=${shown.feedId}&sort=newest&page=1&limit=13`}
                excludeId={shown.id}
                onOpen={openArticle}
              />
            )}
            {!external && (
              <MediaRow
                id="related"
                title="You might also like"
                url={`/api/articles/${shown.id}/similar`}
                excludeId={shown.id}
                onOpen={openArticle}
              />
            )}
            {!external && <DiscussionCard articleId={shown.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function CollectButton({ articleId }: { articleId: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <ActionButton label="Add to collection" onClick={() => setOpen(true)}>
        <FolderPlus className="h-5 w-5" />
      </ActionButton>
      {open && <CollectionPicker articleId={articleId} open onOpenChange={setOpen} />}
    </>
  );
}

/** Before it plays: where it stopped as a line, and one big button to start. */
function IdleControls({ episode, savedAt }: { episode: Episode; savedAt: number }) {
  const audio = useAudio();
  const length = episode.durationSeconds ?? 0;
  const percent = length ? Math.min(100, (savedAt / length) * 100) : 0;
  return (
    <div className="mt-4 w-full">
      <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/15">
        <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{clock(savedAt)}</span>
        <span>{length ? `-${clock(Math.max(0, length - savedAt))}` : "--:--"}</span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => audio.enqueue(episode, "last")}
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-muted-foreground ring-1 ring-border hover:bg-accent"
        >
          <ListEnd className="h-4 w-4" /> Queue
        </button>
        <button
          type="button"
          onClick={() => audio.play(episode, savedAt)}
          className="flex h-14 items-center gap-2 rounded-full bg-foreground px-7 text-base font-semibold text-background transition-transform active:scale-95"
        >
          <Play className="h-5 w-5 fill-current" />
          {savedAt > 0 ? `Resume at ${clock(savedAt)}` : "Play"}
        </button>
      </div>
    </div>
  );
}

/** "Skip ahead": to the next chapter, when there is one. */
function NextChapterButton({ chapters }: { chapters: { t: number; title: string }[] }) {
  const { seek } = useAudio();
  const current = usePlayerTime();
  const next = chapters.find((c) => c.t > current + 1);
  if (!next) return null;
  return (
    <button
      type="button"
      onClick={() => {
        haptic();
        seek(next.t);
      }}
      title={`Next: ${next.title}`}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/10 px-3 text-xs font-semibold hover:bg-foreground/15"
    >
      <SkipForward className="h-3.5 w-3.5 fill-current" /> Skip ahead
    </button>
  );
}

/** About the show: its picture, name, description, and the way to its page. */
function ShowCard({ episode, onOpenShow }: { episode: Episode; onOpenShow: () => void }) {
  const { feeds, mutate } = useFeeds();
  const { setView } = useReaderState();
  const feed = feeds.find((f) => f.id === episode.feedId);
  const [more, setMore] = React.useState(false);
  const [following, setFollowing] = React.useState(false);
  const external = episode.id.startsWith("ext:");
  const followedUrl = external && episode.feedUrl && feeds.some((f) => f.url === episode.feedUrl);
  async function follow() {
    if (!episode.feedUrl) return;
    setFollowing(true);
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: episode.feedUrl, kind: "podcast" }),
      });
      if (!res.ok) throw new Error();
      await mutate();
      toast.success(`Following ${episode.feedTitle}`);
    } catch {
      toast.error("Couldn't follow this show");
    } finally {
      setFollowing(false);
    }
  }
  const description = feed?.description?.replace(/<[^>]+>/g, " ").trim();
  return (
    <MediaCard id="about-show" title="About the podcast">
      <div className="flex items-center gap-3">
        <Art
          src={feed?.coverUrl ?? episode.imageUrl ?? feed?.faviconUrl}
          name={episode.feedTitle}
          className="h-12 w-12 rounded-lg text-lg"
        />
        <p className="min-w-0 flex-1 truncate font-semibold">{episode.feedTitle}</p>
        {feed ? (
          <button
            type="button"
            onClick={() => {
              setView({ type: "feed", id: feed.id, label: feed.title });
              onOpenShow();
            }}
            className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold ring-1 ring-border hover:bg-accent"
          >
            Following
          </button>
        ) : external && episode.feedUrl ? (
          <button
            type="button"
            disabled={Boolean(followedUrl) || following}
            onClick={() => void follow()}
            className="h-8 shrink-0 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {followedUrl ? "Following" : following ? "…" : "Follow"}
          </button>
        ) : null}
      </div>
      {description && (
        <p className={cn("mt-3 text-sm text-muted-foreground", !more && "line-clamp-3")}>
          {description}
        </p>
      )}
      {description && description.length > 160 && (
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="mt-1 text-sm font-semibold hover:underline"
        >
          {more ? "see less" : "… see more"}
        </button>
      )}
    </MediaCard>
  );
}

/** Nothing queued: the next one from the show (or your Later), one tap away. */
function SuggestedNext({
  article,
  onOpen,
}: {
  article: ArticleSummary;
  onOpen: (article: ArticleSummary) => void;
}) {
  const audio = useAudio();
  const next = episodeOf(article);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onOpen(article)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Headphones className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug">{article.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {article.feed.title}
            {article.durationSeconds ? ` · ${durationLabel(article.durationSeconds)}` : ""}
          </span>
        </span>
      </button>
      {next && (
        <button
          type="button"
          onClick={() => audio.enqueue(next, "next")}
          aria-label={`Play ${article.title} next`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border hover:bg-accent"
        >
          <ListStart className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Artwork({ episode, current }: { episode: Episode; current: boolean }) {
  const { playing } = useAudio();
  return (
    <div
      className={cn(
        "aspect-square w-[min(62vw,300px)] overflow-hidden rounded-3xl bg-muted shadow-2xl ring-1 ring-white/10 transition-transform duration-500",
        current && playing ? "scale-100" : "scale-[0.92]"
      )}
    >
      <Art
        src={episode.imageUrl}
        name={episode.feedTitle}
        icon={Headphones}
        className="h-full w-full text-6xl"
      />
    </div>
  );
}

/** The scrubber with chapter marks along it and the loaded stretch shown lighter. */
function ChapterScrubber({ chapters }: { chapters: { t: number; title: string }[] }) {
  const { duration, buffered, seek, sponsors } = useAudio();
  const current = usePlayerTime();
  const [dragging, setDragging] = React.useState<number | null>(null);
  const shown = dragging ?? current;
  const pct = (s: number) => (duration ? Math.min(100, (s / duration) * 100) : 0);
  return (
    <div>
      <div className="relative">
        {/* Loaded so far, under the track. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-[0.3rem] -translate-y-1/2 rounded-full bg-foreground/15"
          style={{ width: `${pct(buffered)}%` }}
        />
        {/* Sponsor reads, which the player jumps over. */}
        {sponsors.map((segment) => (
          <span
            key={segment.start}
            aria-hidden
            className="pointer-events-none absolute top-1/2 z-[1] h-[0.3rem] -translate-y-1/2 rounded-full bg-amber-400/80"
            style={{
              left: `${pct(segment.start)}%`,
              width: `${Math.max(0.6, pct(segment.end) - pct(segment.start))}%`,
            }}
          />
        ))}
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.floor(shown)}
          onChange={(event) => setDragging(Number(event.target.value))}
          onPointerUp={() => {
            if (dragging !== null) seek(dragging);
            setDragging(null);
          }}
          onKeyUp={() => {
            if (dragging !== null) seek(dragging);
            setDragging(null);
          }}
          aria-label="Position"
          aria-valuetext={`${clock(shown)} of ${clock(duration)}`}
          className="audio-scrubber relative w-full"
          style={{ "--progress": `${pct(shown)}%` } as React.CSSProperties}
        />
        {chapters.slice(1).map((chapter) => (
          <span
            key={chapter.t}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-[0.3rem] w-[2px] -translate-y-1/2 bg-background/80"
            style={{ left: `calc(${pct(chapter.t)}% - 1px)` }}
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] tabular-nums text-muted-foreground">
        <span className="shrink-0">{clock(shown)}</span>
        <span className="min-w-0 truncate text-center font-medium text-foreground/80">
          {chapterAt(chapters, shown)}
        </span>
        <span className="shrink-0">
          {duration ? `-${clock(Math.max(0, duration - shown))}` : "--:--"}
        </span>
      </div>
    </div>
  );
}

function chapterAt(chapters: { t: number; title: string }[], seconds: number) {
  let title = "";
  for (const chapter of chapters) if (chapter.t <= seconds + 0.5) title = chapter.title;
  return title;
}

/** Up next, reorderable by dragging the handle; a row's × removes it. */
function QueueList() {
  const { queue, dequeue, moveInQueue, clearQueue, play } = useAudio();
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  const rows = React.useRef<HTMLLIElement[]>([]);

  const indexAtY = (y: number) => {
    let index = queue.length - 1;
    rows.current.forEach((row, i) => {
      const box = row?.getBoundingClientRect();
      if (box && y < box.top + box.height / 2 && i < index) index = i;
    });
    return index;
  };

  if (queue.length === 0) {
    return (
      <Empty text="Nothing queued. Long-press an episode and choose “Play next” or “Add to queue”." />
    );
  }
  return (
    <div>
      <ol className="space-y-1">
        {queue.map((item, i) => (
          <li
            key={item.id}
            ref={(node) => {
              if (node) rows.current[i] = node;
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl bg-card/60 py-2 pl-1 pr-2 ring-1 ring-border/50 transition-transform",
              dragIndex === i && "opacity-60",
              overIndex === i && dragIndex !== null && dragIndex !== i && "ring-primary"
            )}
          >
            <span
              className="flex h-10 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground"
              aria-label="Drag to reorder"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragIndex(i);
                haptic();
              }}
              onPointerMove={(event) => {
                if (dragIndex === null) return;
                setOverIndex(indexAtY(event.clientY));
              }}
              onPointerUp={(event) => {
                const to = indexAtY(event.clientY);
                if (dragIndex !== null && to !== dragIndex) moveInQueue(dragIndex, to);
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={() => {
                dequeue(item.id);
                play(item, 0);
              }}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Headphones className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.feedTitle}
                  {item.durationSeconds ? ` · ${durationLabel(item.durationSeconds)}` : ""}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => dequeue(item.id)}
              aria-label={`Remove ${item.title} from the queue`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={clearQueue}
        className="mt-3 w-full rounded-full py-2 text-xs font-medium text-muted-foreground hover:bg-accent/60"
      >
        Clear the queue
      </button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

/** Share this moment, open the episode, and the show's own settings (speed, skip intro). */
function PlayerMenu({
  episode,
  current,
  onEpisodePage,
}: {
  episode: Episode;
  current: boolean;
  onEpisodePage: () => void;
}) {
  const { shareMoment, showPrefs, setShowPrefs } = useAudio();
  const prefs = showPrefs(episode.feedId);
  const [snipWindow, setSnipWindow] = useSnipWindow();
  const [skipSponsors, setSkipSponsors] = useSkipSponsors();
  const catalogue = episode.id.startsWith("ext:");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More"
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent/60"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {current && (
          <DropdownMenuItem onSelect={() => void shareMoment()} className="gap-2">
            <Share className="h-4 w-4" /> Share this moment
          </DropdownMenuItem>
        )}
        {!catalogue && (
          <DropdownMenuItem onSelect={onEpisodePage} className="gap-2">
            <Text className="h-4 w-4" /> Episode page
          </DropdownMenuItem>
        )}
        <DropdownMenuCheckboxItem checked={skipSponsors} onCheckedChange={setSkipSponsors}>
          Skip sponsors
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">A snip keeps the last</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(snipWindow)}
          onValueChange={(value) => setSnipWindow(Number(value) === 60 ? 60 : 30)}
        >
          {SNIP_WINDOWS.map((seconds) => (
            <DropdownMenuRadioItem key={seconds} value={String(seconds)}>
              {seconds} seconds
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Speed for {episode.feedTitle}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={prefs.rate === undefined ? "default" : String(prefs.rate)}
          onValueChange={(value) =>
            setShowPrefs(episode.feedId, {
              ...prefs,
              rate: value === "default" ? undefined : Number(value),
            })
          }
        >
          <DropdownMenuRadioItem value="default">Same as everywhere</DropdownMenuRadioItem>
          {AUDIO_RATES.map((rate) => (
            <DropdownMenuRadioItem key={rate} value={String(rate)}>
              {rate}×
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Skip the start of each episode</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(prefs.skipIntro ?? 0)}
          onValueChange={(value) =>
            setShowPrefs(episode.feedId, { ...prefs, skipIntro: Number(value) || undefined })
          }
        >
          {[0, 15, 30, 45, 60, 90].map((seconds) => (
            <DropdownMenuRadioItem key={seconds} value={String(seconds)}>
              {seconds === 0 ? "Don't skip" : `${seconds} seconds`}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
