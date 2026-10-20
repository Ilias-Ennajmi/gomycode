"use client";

import * as React from "react";
import {
  ChevronDown,
  GripVertical,
  Headphones,
  ListMusic,
  ListVideo,
  MoreHorizontal,
  Share,
  Text,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clock, durationLabel, useVideoExtras } from "@/lib/hooks/useVideo";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { haptic } from "@/lib/native";
import { AUDIO_RATES, useAudio, type Episode } from "@/components/audio/AudioProvider";
import {
  PlayPauseButton,
  SkipButton,
  SleepButton,
  SnipButton,
  SpeedButton,
  usePlayerTime,
} from "@/components/audio/PlayerControls";
import { SNIP_WINDOWS, useSnipWindow } from "@/lib/snips";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tab = "queue" | "chapters" | "transcript";

/**
 * The full-screen player: swipe up from the bar (or tap it) and the artwork, a scrubber
 * with chapter marks, the controls, and three tabs (up next, chapters, transcript) take
 * the screen. Swipe down, or tap the chevron, to shrink it back to the bar.
 */
export function NowPlayingSheet() {
  const audio = useAudio();
  const { episode, expanded, setExpanded } = audio;
  const close = React.useCallback(() => setExpanded(false), [setExpanded]);
  useBackToClose(expanded && Boolean(episode), close);

  // Swipe down on the top part to close.
  const [dy, setDy] = React.useState(0);
  const drag = React.useRef<{ y: number; vertical: boolean | null } | null>(null);
  const [tab, setTab] = React.useState<Tab>("chapters");
  const { extras } = useVideoExtras(expanded && episode ? episode.id : null);
  // Open on what the episode has: chapters when it has some, else the transcript, else the queue.
  React.useEffect(() => {
    if (!extras) return;
    setTab(
      extras.chapters.length
        ? "chapters"
        : extras.transcript.length
          ? "transcript"
          : audio.queue.length
            ? "queue"
            : "chapters"
    );
    // Once per episode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id, extras === null]);

  if (!episode) return null;
  const open = expanded;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground transition-transform duration-300 ease-out",
        open ? "translate-y-0" : "pointer-events-none translate-y-full"
      )}
      style={dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined}
      role="dialog"
      aria-modal={open}
      aria-label="Now playing"
      inert={open ? undefined : true}
    >
      {/* The artwork, blown up and blurred, as the room's light. */}
      {episode.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={episode.imageUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-3xl saturate-150"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/20 via-background/70 to-background" />

      <div
        className="relative flex min-h-0 flex-1 flex-col pt-safe"
        onTouchStart={(event) => {
          if ((event.target as HTMLElement).closest("[data-scroll], input, button")) return;
          drag.current = { y: event.touches[0].clientY, vertical: null };
        }}
        onTouchMove={(event) => {
          const d = drag.current;
          if (!d) return;
          const my = event.touches[0].clientY - d.y;
          if (d.vertical === null && Math.abs(my) > 8) d.vertical = true;
          if (d.vertical && my > 0) setDy(my);
        }}
        onTouchEnd={() => {
          const moved = dy;
          drag.current = null;
          setDy(0);
          if (moved > 120) close();
        }}
      >
        <header className="flex h-14 shrink-0 items-center px-2">
          <button
            type="button"
            onClick={close}
            aria-label="Minimize the player"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent/60"
          >
            <ChevronDown className="h-6 w-6" />
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {episode.feedTitle}
          </p>
          <PlayerMenu episode={episode} />
        </header>

        <div className="flex shrink-0 flex-col items-center px-6">
          <Artwork episode={episode} />
          <h2 className="mt-5 line-clamp-2 text-center text-lg font-semibold leading-snug">
            {episode.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {episode.durationSeconds ? durationLabel(episode.durationSeconds) : episode.feedTitle}
          </p>
        </div>

        <div className="shrink-0 px-6 pt-5">
          <ChapterScrubber chapters={extras?.chapters ?? []} />
          <div className="mt-3 flex items-center justify-between">
            <SpeedButton />
            <div className="flex items-center gap-3">
              <SkipButton seconds={-15} />
              <PlayPauseButton className="h-16 w-16" />
              <SkipButton seconds={30} />
            </div>
            <SleepButton />
          </div>
          <div className="mt-2 flex justify-center">
            <SnipButton label />
          </div>
        </div>

        <div className="mt-5 flex shrink-0 gap-1 px-6" role="tablist">
          {(
            [
              ["queue", "Up next", <ListMusic key="q" className="h-3.5 w-3.5" />],
              ["chapters", "Chapters", <ListVideo key="c" className="h-3.5 w-3.5" />],
              ["transcript", "Transcript", <Text key="t" className="h-3.5 w-3.5" />],
            ] as [Tab, string, React.ReactNode][]
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-colors",
                tab === id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent/60"
              )}
            >
              {icon}
              {label}
              {id === "queue" && audio.queue.length > 0 && (
                <span className="rounded-full bg-background/20 px-1.5 text-[10px]">
                  {audio.queue.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div
          data-scroll
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe pt-3 scrollbar-thin"
        >
          {tab === "queue" && <QueueList />}
          {tab === "chapters" && <ChapterList chapters={extras?.chapters ?? []} />}
          {tab === "transcript" && <LiveTranscript transcript={extras?.transcript ?? []} />}
        </div>
      </div>
    </div>
  );
}

function Artwork({ episode }: { episode: Episode }) {
  const { playing } = useAudio();
  return (
    <div
      className={cn(
        "aspect-square w-[min(62vw,300px)] overflow-hidden rounded-3xl bg-muted shadow-2xl ring-1 ring-white/10 transition-transform duration-500",
        playing ? "scale-100" : "scale-[0.92]"
      )}
    >
      {episode.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={episode.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-primary">
          <Headphones className="h-16 w-16" />
        </span>
      )}
    </div>
  );
}

/** The scrubber with chapter marks along it and the loaded stretch shown lighter. */
function ChapterScrubber({ chapters }: { chapters: { t: number; title: string }[] }) {
  const { duration, buffered, seek } = useAudio();
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
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{clock(shown)}</span>
        <span>{duration ? `-${clock(Math.max(0, duration - shown))}` : "--:--"}</span>
      </div>
    </div>
  );
}

function ChapterList({ chapters }: { chapters: { t: number; title: string }[] }) {
  const { seek } = useAudio();
  const current = usePlayerTime();
  if (chapters.length === 0) {
    return <Empty text="No chapters for this episode." />;
  }
  let active = -1;
  chapters.forEach((c, i) => {
    if (c.t <= current + 0.5) active = i;
  });
  return (
    <ol className="space-y-0.5">
      {chapters.map((chapter, i) => (
        <li key={`${chapter.t}-${i}`}>
          <button
            type="button"
            onClick={() => seek(chapter.t)}
            className={cn(
              "flex w-full items-baseline gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/60",
              i === active && "bg-primary/10 font-medium"
            )}
          >
            <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-primary">
              {clock(chapter.t)}
            </span>
            <span className="min-w-0 flex-1">{chapter.title}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** The transcript scrolls with the audio; the part being said is lit. Tap one to jump. */
function LiveTranscript({ transcript }: { transcript: { t: number; text: string }[] }) {
  const { seek } = useAudio();
  const current = usePlayerTime();
  const list = React.useRef<HTMLOListElement>(null);
  const userScrolled = React.useRef(0);
  let active = -1;
  transcript.forEach((part, i) => {
    if (part.t <= current + 0.5) active = i;
  });
  React.useEffect(() => {
    // Follow the audio unless the reader scrolled on their own in the last few seconds.
    if (active < 0 || Date.now() - userScrolled.current < 4000) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);
  if (transcript.length === 0) {
    return <Empty text="No transcript yet. It appears once Gemini has listened to the episode." />;
  }
  return (
    <ol
      ref={list}
      className="space-y-1 pb-6"
      onWheel={() => (userScrolled.current = Date.now())}
      onTouchMove={() => (userScrolled.current = Date.now())}
    >
      {transcript.map((part, i) => (
        <li key={`${part.t}-${i}`} data-index={i}>
          <button
            type="button"
            onClick={() => seek(part.t)}
            className={cn(
              "w-full rounded-xl px-3 py-2 text-left text-[15px] leading-relaxed transition-colors",
              i === active
                ? "bg-primary/10 text-foreground"
                : i < active
                  ? "text-muted-foreground/70 hover:text-foreground"
                  : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="mr-2 font-mono text-[11px] text-primary">{clock(part.t)}</span>
            {part.text}
          </button>
        </li>
      ))}
    </ol>
  );
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
function PlayerMenu({ episode }: { episode: Episode }) {
  const { shareMoment, showPrefs, setShowPrefs, setExpanded } = useAudio();
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const prefs = showPrefs(episode.feedId);
  const [snipWindow, setSnipWindow] = useSnipWindow();
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
        <DropdownMenuItem onSelect={() => void shareMoment()} className="gap-2">
          <Share className="h-4 w-4" /> Share this moment
        </DropdownMenuItem>
        {!catalogue && (
          <DropdownMenuItem
            onSelect={() => {
              setExpanded(false);
              setSelectedArticleId(episode.id);
              setMobilePane("reader");
            }}
            className="gap-2"
          >
            <Text className="h-4 w-4" /> Episode notes
          </DropdownMenuItem>
        )}
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
