"use client";

import * as React from "react";
import {
  ChevronDown,
  FileText,
  FolderPlus,
  Headphones,
  ListMusic,
  ListVideo,
  Car,
  Play,
  Scissors,
  Share,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { durationLabel, useVideoExtras } from "@/lib/hooks/useVideo";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { haptic } from "@/lib/native";
import { episodeOf, resumePoint, useAudio, type Episode } from "@/components/audio/AudioProvider";
import { useArticle } from "@/lib/hooks/useArticles";
import { useArticleHighlights } from "@/lib/hooks/useHighlights";
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
import { useT } from "@/lib/i18n";
import { DownloadButton } from "@/components/audio/Downloads";
import { requestAppEvent } from "@/lib/app-events";
import { PlayerMenu } from "@/components/audio/player/PlayerMenu";
import { QueueList } from "@/components/audio/player/QueueList";
import { ShowCard } from "@/components/audio/player/ShowCard";
import {
  IdleControls,
  SuggestedNext,
  ChapterScrubber,
} from "@/components/audio/player/PlayerParts";
import { Empty } from "@/components/audio/player/Shared";

/**
 * The full-screen player, laid out like a podcast app's: the artwork, the title, a scrubber
 * with chapter marks and the chapter playing, the controls; then, as you scroll, cards that
 * fold shut: read along, chapters, key moments, your snips, about the episode, about the
 * show, up next, more from the show, similar episodes, discussion. Opens from the bar at the
 * bottom, or from an episode tapped in a list (shown, not playing, until Play).
 * Swipe down from the top, or tap the chevron, to shrink it back to the bar.
 */
export function NowPlayingSheet() {
  const { t } = useT();
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
      aria-label={isCurrent ? t("Now playing") : shown.title}
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
              aria-label={t("Minimize the player")}
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
                  {isCurrent ? t("Playing from podcast") : t("Podcast episode")}
                </span>
                <span className="block truncate text-sm font-semibold">{shown.feedTitle}</span>
              </p>
            )}
            <PlayerMenu episode={shown} current={isCurrent} onEpisodePage={openEpisodePage} />
          </div>
        </header>

        <div className="mx-auto max-w-xl px-5 pb-safe">
          <section aria-label={t("Player")} className="flex flex-col items-center pt-3">
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
                  <ActionButton label={t("Episode page")} onClick={openEpisodePage}>
                    <FileText className="h-5 w-5" />
                  </ActionButton>
                )}
                {!external && <CollectButton articleId={shown.id} />}
                <DownloadButton episode={shown} />
              </div>
              <div className="flex items-center gap-1">
                {isCurrent && (
                  <ActionButton label={t("Car mode")} onClick={() => requestAppEvent("car-mode")}>
                    <Car className="h-5 w-5" />
                  </ActionButton>
                )}
                {isCurrent && <SnipButton />}
                <ActionButton
                  label={t("Share")}
                  onClick={() =>
                    isCurrent
                      ? void audio.shareMoment()
                      : void shareLink(shown.title, article?.link ?? shown.audioUrl)
                  }
                >
                  <Share className="h-5 w-5" />
                </ActionButton>
                <ActionButton
                  label={t("Up next")}
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
                {t(
                  "The transcript, chapters and key moments are on their way: Gemini is listening to the episode."
                )}
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
              title={t("Chapters")}
              icon={ListVideo}
              items={chapters.map((c) => ({ t: c.t, label: c.title }))}
              store={store}
              onSeek={seek}
              artwork={shown.imageUrl}
            />
            <TimeListCard
              id="key-moments"
              title={t("Key moments")}
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
                title={t("About the episode")}
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
            <MediaCard id="up-next" title={t("Up next")} icon={ListMusic}>
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
                title={t("You might also like")}
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
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(label)}
      title={t(label)}
      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function CollectButton({ articleId }: { articleId: string }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <ActionButton label={t("Add to collection")} onClick={() => setOpen(true)}>
        <FolderPlus className="h-5 w-5" />
      </ActionButton>
      {open && <CollectionPicker articleId={articleId} open onOpenChange={setOpen} />}
    </>
  );
}

/** "Skip ahead": to the next chapter, when there is one. */
function NextChapterButton({ chapters }: { chapters: { t: number; title: string }[] }) {
  const { t } = useT();
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
      <SkipForward className="h-3.5 w-3.5 fill-current" /> {t("Skip ahead")}
    </button>
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
