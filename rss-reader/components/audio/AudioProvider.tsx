"use client";

import * as React from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { createTimeStore, type TimeStore } from "@/components/video/VideoGuide";
import { saveVideoProgress } from "@/lib/hooks/useVideo";
import { toggleArticleRead } from "@/lib/hooks/useArticles";
import type { ArticleSummary, VideoExtras } from "@/lib/types";

// One audio player for the whole app, like a podcast app: an episode keeps playing while
// you read something else, the bar at the bottom controls it, and the phone's lock screen
// and notification shade show it (Media Session). Where you stopped is saved, so it
// resumes there, here or on another device.

export interface Episode {
  id: string;
  title: string;
  feedId: string;
  feedTitle: string;
  imageUrl: string | null;
  audioUrl: string;
  durationSeconds: number | null;
}

export function episodeOf(article: ArticleSummary): Episode | null {
  if (!article.audioUrl) return null;
  return {
    id: article.id,
    title: article.title,
    feedId: article.feedId,
    feedTitle: article.feed.title,
    imageUrl: article.imageUrl,
    audioUrl: article.audioUrl,
    durationSeconds: article.durationSeconds ?? null,
  };
}

/** Where to pick up an episode: where it stopped, unless that was (nearly) the end. */
export function resumePoint(article: Pick<ArticleSummary, "watchedSeconds" | "durationSeconds">) {
  const seconds = article.watchedSeconds ?? 0;
  const duration = article.durationSeconds ?? 0;
  return seconds > 5 && (!duration || seconds < duration - 20) ? seconds : 0;
}

export const AUDIO_RATES = [0.8, 1, 1.2, 1.5, 1.8, 2] as const;
const RATE_KEY = "audio-playback-rate";
const LAST_KEY = "audio-last-episode";
const QUEUE_KEY = "audio-queue";
const SHOW_PREFS_KEY = "audio-show-prefs";
/** After a pause this long, resuming backs up a little so the thread is easy to pick up. */
const REWIND_AFTER_MS = 60_000;
const REWIND_SECONDS = 3;

/** Per show: a default speed, and seconds to skip at the start (long intros). */
export interface ShowPrefs {
  rate?: number;
  skipIntro?: number;
}

function readShowPrefs(): Record<string, ShowPrefs> {
  try {
    return JSON.parse(localStorage.getItem(SHOW_PREFS_KEY) ?? "{}") as Record<string, ShowPrefs>;
  } catch {
    return {};
  }
}
const SAVE_EVERY_MS = 15_000;
/** Counts as listened from here: the end is usually credits and ads. */
const DONE_PERCENT = 95;

export type SleepTimer = { kind: "minutes"; until: number } | { kind: "end" } | null;

interface AudioContextValue {
  episode: Episode | null;
  playing: boolean;
  buffering: boolean;
  duration: number;
  /** How far ahead of the position the audio has loaded, in seconds. */
  buffered: number;
  rate: number;
  sleep: SleepTimer;
  /** What plays after this one, in order. */
  queue: Episode[];
  /** The full-screen player is open. */
  expanded: boolean;
  setExpanded: (open: boolean) => void;
  enqueue: (episode: Episode, where: "next" | "last") => void;
  dequeue: (id: string) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  /** Plays the next episode now (the queue first, then the show). */
  next: () => void;
  showPrefs: (feedId: string) => ShowPrefs;
  setShowPrefs: (feedId: string, prefs: ShowPrefs) => void;
  /** A link to this moment of the episode, shared or copied. */
  shareMoment: () => Promise<void>;
  /** The position, without re-rendering everything that uses the player every second. */
  time: TimeStore;
  play: (episode: Episode, startAt?: number) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setRate: (rate: number) => void;
  setSleep: (sleep: "end" | number | null) => void;
  close: () => void;
}

const AudioContext = React.createContext<AudioContextValue | null>(null);

export function useAudio() {
  const value = React.useContext(AudioContext);
  if (!value) throw new Error("useAudio must be used inside AudioProvider");
  return value;
}

function readRate() {
  try {
    const value = Number(localStorage.getItem(RATE_KEY));
    return AUDIO_RATES.includes(value as (typeof AUDIO_RATES)[number]) ? value : 1;
  } catch {
    return 1;
  }
}

function remember(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: only this visit remembers.
  }
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [episode, setEpisode] = React.useState<Episode | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [buffering, setBuffering] = React.useState(false);
  const [duration, setDuration] = React.useState(0);
  const [rate, setRateState] = React.useState(1);
  const [sleep, setSleepState] = React.useState<SleepTimer>(null);
  const [buffered, setBuffered] = React.useState(0);
  const [queue, setQueue] = React.useState<Episode[]>([]);
  const [expanded, setExpanded] = React.useState(false);
  const [prefsVersion, setPrefsVersion] = React.useState(0);
  const time = React.useMemo(() => createTimeStore(), []);
  const pausedAt = React.useRef<number | null>(null);
  const queueRef = React.useRef<Episode[]>([]);
  queueRef.current = queue;
  const { mutate } = useSWRConfig();

  const episodeRef = React.useRef<Episode | null>(null);
  episodeRef.current = episode;
  const sleepRef = React.useRef<SleepTimer>(null);
  sleepRef.current = sleep;
  const lastSave = React.useRef(0);
  const markedDone = React.useRef<string | null>(null);
  // A position to jump to once the new file has loaded enough to seek.
  const pendingSeek = React.useRef<number | null>(null);

  const refreshLists = React.useCallback(
    () => mutate((key) => typeof key === "string" && key.startsWith("/api/articles")),
    [mutate]
  );

  const save = React.useCallback(() => {
    const audio = audioRef.current;
    const current = episodeRef.current;
    if (!audio || !current) return;
    const length = audio.duration || current.durationSeconds || 0;
    if (!length) return;
    const percent = Math.min(100, (audio.currentTime / length) * 100);
    lastSave.current = Date.now();
    // Finished: next time it starts over.
    const seconds = percent >= DONE_PERCENT ? 0 : audio.currentTime;
    saveVideoProgress(current.id, seconds, percent).catch(() => undefined);
    remember(LAST_KEY, { episode: current, position: seconds });
    if (percent >= DONE_PERCENT && markedDone.current !== current.id) {
      markedDone.current = current.id;
      toggleArticleRead(current.id, true)
        .then(refreshLists)
        .catch(() => undefined);
    }
  }, [refreshLists]);

  const load = React.useCallback(
    (next: Episode, startAt: number, autoplay: boolean) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (episodeRef.current && episodeRef.current.id !== next.id) save();
      setEpisode(next);
      episodeRef.current = next;
      markedDone.current = null;
      setDuration(next.durationSeconds ?? 0);
      time.set(startAt);
      if (!autoplay) {
        // Restored on start: nothing is downloaded until play is pressed.
        audio.removeAttribute("src");
        pendingSeek.current = startAt > 0 ? startAt : null;
      } else if (audio.getAttribute("src") !== next.audioUrl) {
        audio.src = next.audioUrl;
        pendingSeek.current = startAt > 0 ? startAt : null;
      } else if (startAt >= 0) {
        audio.currentTime = startAt;
      }
      const show = readShowPrefs()[next.feedId] ?? {};
      // A show's own speed wins over the general one; a long intro is skipped on a fresh start.
      const rate = show.rate ?? readRate();
      audio.playbackRate = rate;
      setRateState(rate);
      if (startAt === 0 && show.skipIntro && autoplay) {
        pendingSeek.current = show.skipIntro;
        time.set(show.skipIntro);
      }
      remember(LAST_KEY, { episode: next, position: startAt });
      if (autoplay) {
        audio.play().catch((error: Error) => {
          // The browser wants a tap first (autoplay rules): the play button is right there.
          if (error.name !== "NotAllowedError") toast.error("Couldn't play this episode");
        });
      }
    },
    [save, time]
  );

  const play = React.useCallback(
    (next: Episode, startAt?: number) => {
      const current = episodeRef.current;
      const audio = audioRef.current;
      if (current?.id === next.id && audio) {
        if (!audio.getAttribute("src")) {
          audio.src = next.audioUrl;
          if (startAt !== undefined) pendingSeek.current = startAt;
        } else if (startAt !== undefined) {
          audio.currentTime = startAt;
        }
        audio.play().catch(() => undefined);
        return;
      }
      load(next, startAt ?? 0, true);
    },
    [load]
  );

  const toggle = React.useCallback(() => {
    const audio = audioRef.current;
    const current = episodeRef.current;
    if (!audio || !current) return;
    if (!audio.getAttribute("src")) audio.src = current.audioUrl;
    if (audio.paused) {
      // Back up a little after a long pause, so the thread is easy to pick up again.
      if (
        pausedAt.current &&
        Date.now() - pausedAt.current > REWIND_AFTER_MS &&
        audio.currentTime > REWIND_SECONDS + 2
      ) {
        audio.currentTime -= REWIND_SECONDS;
        time.set(audio.currentTime);
      }
      audio.play().catch(() => toast.error("Couldn't play this episode"));
    } else {
      audio.pause();
    }
  }, [time]);

  const seek = React.useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audio.getAttribute("src")) {
        // Not loaded yet: start there when play is pressed.
        pendingSeek.current = Math.max(0, seconds);
        time.set(pendingSeek.current);
        return;
      }
      const length = audio.duration || duration;
      audio.currentTime = Math.max(0, length ? Math.min(seconds, length - 1) : seconds);
      time.set(audio.currentTime);
    },
    [duration, time]
  );

  const skip = React.useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seek((audio.getAttribute("src") ? audio.currentTime : time.get()) + delta);
    },
    [seek, time]
  );

  const setRate = React.useCallback((next: number) => {
    setRateState(next);
    // Remembered for this show if it has its own speed, else for everything.
    const current = episodeRef.current;
    const prefs = readShowPrefs();
    if (current && prefs[current.feedId]?.rate !== undefined) {
      prefs[current.feedId] = { ...prefs[current.feedId], rate: next };
      remember(SHOW_PREFS_KEY, prefs);
    } else {
      remember(RATE_KEY, next);
    }
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, []);

  const showPrefs = React.useCallback(
    (feedId: string) => readShowPrefs()[feedId] ?? {},
    // Re-read when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefsVersion]
  );
  const setShowPrefs = React.useCallback((feedId: string, next: ShowPrefs) => {
    const prefs = readShowPrefs();
    const cleaned: ShowPrefs = {};
    if (next.rate !== undefined) cleaned.rate = next.rate;
    if (next.skipIntro) cleaned.skipIntro = next.skipIntro;
    if (Object.keys(cleaned).length) prefs[feedId] = cleaned;
    else delete prefs[feedId];
    remember(SHOW_PREFS_KEY, prefs);
    setPrefsVersion((v) => v + 1);
    const current = episodeRef.current;
    if (current?.feedId === feedId && cleaned.rate !== undefined && audioRef.current) {
      audioRef.current.playbackRate = cleaned.rate;
      setRateState(cleaned.rate);
    }
  }, []);

  const saveQueue = React.useCallback((next: Episode[]) => {
    setQueue(next);
    queueRef.current = next;
    remember(QUEUE_KEY, next);
  }, []);
  const enqueue = React.useCallback(
    (item: Episode, where: "next" | "last") => {
      const without = queueRef.current.filter((e) => e.id !== item.id);
      saveQueue(where === "next" ? [item, ...without] : [...without, item]);
      toast(where === "next" ? "Playing next" : "Added to the queue", {
        description: item.title,
      });
    },
    [saveQueue]
  );
  const dequeue = React.useCallback(
    (id: string) => saveQueue(queueRef.current.filter((e) => e.id !== id)),
    [saveQueue]
  );
  const moveInQueue = React.useCallback(
    (from: number, to: number) => {
      const next = [...queueRef.current];
      const [item] = next.splice(from, 1);
      if (!item) return;
      next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
      saveQueue(next);
    },
    [saveQueue]
  );
  const clearQueue = React.useCallback(() => saveQueue([]), [saveQueue]);

  const shareMoment = React.useCallback(async () => {
    const current = episodeRef.current;
    if (!current) return;
    const seconds = Math.floor(time.get());
    const url = `${window.location.origin}/reader?article=${current.id}&t=${seconds}`;
    const text = `${current.title} · ${current.feedTitle}`;
    try {
      if (navigator.share) await navigator.share({ title: current.title, text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied", { description: "Opens the episode at this moment." });
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error("Couldn't share");
    }
  }, [time]);

  const setSleep = React.useCallback((value: "end" | number | null) => {
    if (value === null) setSleepState(null);
    else if (value === "end") setSleepState({ kind: "end" });
    else setSleepState({ kind: "minutes", until: Date.now() + value * 60_000 });
  }, []);

  const close = React.useCallback(() => {
    const audio = audioRef.current;
    save();
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setEpisode(null);
    setPlaying(false);
    setSleepState(null);
    remember(LAST_KEY, null);
  }, [save]);

  // The next episode when one ends: the Later queue first, then the same show.
  const playNext = React.useCallback(async () => {
    const current = episodeRef.current;
    if (!current) return;
    const [queued, ...rest] = queueRef.current;
    if (queued) {
      saveQueue(rest);
      load(queued, 0, true);
      return;
    }
    try {
      const res = await fetch(`/api/articles/${current.id}/video`);
      const extras = (await res.json()) as VideoExtras;
      const next = extras.upNext ? episodeOf(extras.upNext) : null;
      if (!next) return;
      load(next, resumePoint(extras.upNext!), true);
      toast(`Playing next: ${next.title}`, {
        action: { label: "Stop", onClick: () => audioRef.current?.pause() },
      });
    } catch {
      // No next episode: stay on the finished one.
    }
  }, [load, saveQueue]);
  const next = React.useCallback(() => void playNext(), [playNext]);

  // Restore the last episode (paused) so the bar offers to pick up where you were.
  React.useEffect(() => {
    setRateState(readRate());
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as {
        episode: Episode;
        position: number;
      } | null;
      if (last?.episode?.audioUrl) load(last.episode, last.position ?? 0, false);
      const savedQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Episode[];
      if (Array.isArray(savedQueue)) saveQueue(savedQueue.filter((e) => e?.audioUrl));
    } catch {
      // Nothing to restore.
    }
    // Once, on start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sleep timer by minutes.
  React.useEffect(() => {
    if (sleep?.kind !== "minutes") return;
    const wait = sleep.until - Date.now();
    const timer = setTimeout(
      () => {
        audioRef.current?.pause();
        setSleepState(null);
        toast("Sleep timer: paused");
      },
      Math.max(0, wait)
    );
    return () => clearTimeout(timer);
  }, [sleep]);

  // Lock screen and notification controls.
  React.useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (!episode) {
      session.metadata = null;
      return;
    }
    session.metadata = new MediaMetadata({
      title: episode.title,
      artist: episode.feedTitle,
      album: episode.feedTitle,
      artwork: episode.imageUrl ? [{ src: episode.imageUrl, sizes: "512x512" }] : [],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => audioRef.current?.play().catch(() => undefined)],
      ["pause", () => audioRef.current?.pause()],
      ["seekbackward", (d) => skip(-(d.seekOffset ?? 15))],
      ["seekforward", (d) => skip(d.seekOffset ?? 30)],
      ["seekto", (d) => d.seekTime !== undefined && seek(d.seekTime)],
      ["nexttrack", () => void playNext()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not supported on this device.
      }
    }
  }, [episode, playNext, seek, skip]);

  function updatePositionState() {
    const audio = audioRef.current;
    if (!audio || !("mediaSession" in navigator) || !audio.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, audio.duration),
      });
    } catch {
      // Inconsistent values while loading.
    }
  }

  const value: AudioContextValue = {
    episode,
    playing,
    buffering,
    duration,
    buffered,
    rate,
    sleep,
    queue,
    expanded,
    setExpanded,
    enqueue,
    dequeue,
    moveInQueue,
    clearQueue,
    next,
    showPrefs,
    setShowPrefs,
    shareMoment,
    time,
    play,
    toggle,
    seek,
    skip,
    setRate,
    setSleep,
    close,
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          if (Number.isFinite(audio.duration)) setDuration(audio.duration);
          if (pendingSeek.current !== null) {
            audio.currentTime = pendingSeek.current;
            pendingSeek.current = null;
          }
          audio.playbackRate = readRate();
          updatePositionState();
        }}
        onTimeUpdate={(event) => {
          time.set(event.currentTarget.currentTime);
          if (Date.now() - lastSave.current > SAVE_EVERY_MS && !event.currentTarget.paused) {
            save();
            updatePositionState();
          }
        }}
        onProgress={(event) => {
          const audio = event.currentTarget;
          // The loaded stretch around the position, for the scrubber.
          let end = 0;
          for (let i = 0; i < audio.buffered.length; i++) {
            if (audio.buffered.start(i) <= audio.currentTime + 1) {
              end = Math.max(end, audio.buffered.end(i));
            }
          }
          setBuffered(end);
        }}
        onPlay={() => {
          pausedAt.current = null;
          setPlaying(true);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
        }}
        onPause={() => {
          pausedAt.current = Date.now();
          setPlaying(false);
          setBuffering(false);
          save();
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onRateChange={updatePositionState}
        onSeeked={updatePositionState}
        onEnded={() => {
          save();
          if (sleepRef.current?.kind === "end") {
            setSleepState(null);
            return;
          }
          void playNext();
        }}
        onError={() => {
          if (!episodeRef.current) return;
          setPlaying(false);
          setBuffering(false);
          toast.error("This episode didn't load", {
            description: "The podcast's server may be down. Try again in a moment.",
          });
        }}
      />
    </AudioContext.Provider>
  );
}
