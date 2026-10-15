"use client";

import * as React from "react";
import { Loader2, Moon, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { clock } from "@/lib/hooks/useVideo";
import { AUDIO_RATES, useAudio, type SleepTimer } from "@/components/audio/AudioProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The playing position, re-rendering only this component every second. */
export function usePlayerTime() {
  const { time } = useAudio();
  return React.useSyncExternalStore(time.subscribe, time.get, () => 0);
}

/** A seek bar with the time played and left. Dragging previews; letting go seeks. */
export function Scrubber({ className }: { className?: string }) {
  const { duration, seek } = useAudio();
  const current = usePlayerTime();
  const [dragging, setDragging] = React.useState<number | null>(null);
  const shown = dragging ?? current;
  const percent = duration ? Math.min(100, (shown / duration) * 100) : 0;
  return (
    <div className={cn("w-full", className)}>
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
        className="audio-scrubber w-full"
        style={{ "--progress": `${percent}%` } as React.CSSProperties}
      />
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{clock(shown)}</span>
        <span>{duration ? `-${clock(Math.max(0, duration - shown))}` : "--:--"}</span>
      </div>
    </div>
  );
}

export function PlayPauseButton({
  size = "lg",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  const { playing, buffering, toggle } = useAudio();
  const Icon = buffering ? Loader2 : playing ? Pause : Play;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Pause" : "Play"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95",
        size === "lg" ? "h-14 w-14" : "h-9 w-9",
        className
      )}
    >
      <Icon
        className={cn(
          size === "lg" ? "h-6 w-6" : "h-4 w-4",
          buffering ? "animate-spin" : !playing && "translate-x-px fill-current",
          playing && !buffering && "fill-current"
        )}
      />
    </button>
  );
}

/** Tap to skip; hold to keep skipping (a step every ~0.2 s after half a second). */
export function SkipButton({ seconds, className }: { seconds: number; className?: string }) {
  const { skip } = useAudio();
  const Icon = seconds < 0 ? RotateCcw : RotateCw;
  const hold = React.useRef<{
    start?: ReturnType<typeof setTimeout>;
    repeat?: ReturnType<typeof setInterval>;
    held: boolean;
  }>({
    held: false,
  });
  const stop = React.useCallback(() => {
    clearTimeout(hold.current.start);
    clearInterval(hold.current.repeat);
  }, []);
  React.useEffect(() => stop, [stop]);
  return (
    <button
      type="button"
      onPointerDown={() => {
        hold.current.held = false;
        hold.current.start = setTimeout(() => {
          hold.current.held = true;
          hold.current.repeat = setInterval(() => skip(seconds), 200);
        }, 500);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        // A hold already skipped: its release isn't another tap.
        if (hold.current.held) hold.current.held = false;
        else skip(seconds);
      }}
      aria-label={seconds < 0 ? `Back ${-seconds} seconds` : `Forward ${seconds} seconds`}
      className={cn(
        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-accent",
        className
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={1.75} />
      <span className="absolute text-[9px] font-bold">{Math.abs(seconds)}</span>
    </button>
  );
}

function rateLabel(rate: number) {
  return `${rate % 1 === 0 ? rate.toFixed(0) : rate}×`;
}

/** Tap to go through the speeds; the choice is kept for every episode. */
export function SpeedButton({ className }: { className?: string }) {
  const { rate, setRate } = useAudio();
  const next = AUDIO_RATES[(AUDIO_RATES.indexOf(rate as never) + 1) % AUDIO_RATES.length] ?? 1;
  return (
    <button
      type="button"
      onClick={() => setRate(next)}
      aria-label={`Speed ${rateLabel(rate)}, tap for ${rateLabel(next)}`}
      className={cn(
        "flex h-9 min-w-[3.25rem] items-center justify-center rounded-full border px-2.5 text-[13px] font-semibold tabular-nums hover:bg-accent",
        rate !== 1 && "border-primary/50 text-primary",
        className
      )}
    >
      {rateLabel(rate)}
    </button>
  );
}

function sleepLabel(sleep: SleepTimer, now: number) {
  if (!sleep) return null;
  if (sleep.kind === "end") return "End of episode";
  return `${Math.max(1, Math.ceil((sleep.until - now) / 60_000))} min`;
}

export function SleepButton({ className }: { className?: string }) {
  const { sleep, setSleep } = useAudio();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (sleep?.kind !== "minutes") return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [sleep]);
  const label = sleepLabel(sleep, now);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label ? `Sleep timer: ${label}` : "Sleep timer"}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-medium hover:bg-accent",
            sleep && "border-primary/50 text-primary",
            className
          )}
        >
          <Moon className="h-3.5 w-3.5" />
          {label && <span className="tabular-nums">{label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Stop playing in…</DropdownMenuLabel>
        {[15, 30, 45, 60].map((minutes) => (
          <DropdownMenuItem key={minutes} onSelect={() => setSleep(minutes)}>
            {minutes} minutes
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => setSleep("end")}>End of episode</DropdownMenuItem>
        {sleep && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSleep(null)}>Turn off</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
