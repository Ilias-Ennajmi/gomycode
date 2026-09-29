"use client";

// YouTube's IFrame Player API: the embedded player the app can talk to (position, speed,
// seeking, "ended"). Loaded once, on the first video opened.

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  destroy(): void;
}

interface YTEvent<T = number> {
  target: YTPlayer;
  data: T;
}

export interface YTPlayerOptions {
  host?: string;
  videoId: string;
  width?: string;
  height?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (event: YTEvent<null>) => void;
    onStateChange?: (event: YTEvent) => void;
    onPlaybackRateChange?: (event: YTEvent) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const PLAYER_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const;

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        loading = null;
        reject(new Error("Could not load the YouTube player"));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

const RATE_KEY = "video-playback-rate";

/** The speed chosen last time (1, 1.25, 1.5, 2…), kept on this device. */
export function savedPlaybackRate() {
  try {
    const rate = Number(localStorage.getItem(RATE_KEY));
    return rate > 0 && rate <= 2 ? rate : 1;
  } catch {
    return 1;
  }
}

export function savePlaybackRate(rate: number) {
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // Not remembered on this device.
  }
}

// "Play" on the up-next card: the next video starts by itself (the tap counts as the
// gesture browsers ask for before playing sound). Tied to that video and a few seconds, so
// a player set up twice (React's development mode) still sees it.
let autoplayFor: { videoId: string; until: number } | null = null;
export function requestAutoplay(videoId: string) {
  autoplayFor = { videoId, until: Date.now() + 10_000 };
}
export function shouldAutoplay(videoId: string) {
  return autoplayFor?.videoId === videoId && Date.now() < autoplayFor.until;
}
