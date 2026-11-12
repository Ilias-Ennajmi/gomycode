"use client";

import { Camera, ImageUp, Pause, Play, Repeat, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { getPlaybackStore } from "@/lib/engine/media/playback-store";
import type { VideoObj } from "@/lib/engine/model/types";
import { chromeButton } from "./controls";
import { Tip } from "./Tip";

/**
 * The selection bar's controls for videos and GIFs. They are the video's controls: playing a clip, muting, looping,
 * scrubbing, using the current frame as the poster and grabbing it as a picture all live here (named buttons, keyboard
 * reachable) so the canvas itself keeps every pointer gesture. A locked video can still be played, not changed.
 */
export function VideoBarControls({ objs, locked, side }: { objs: VideoObj[]; locked: boolean; side: "top" | "bottom" }) {
  const { run, registry, commandCtx } = useEditor();
  const store = getPlaybackStore();
  const single = objs.length === 1 ? objs[0] : null;
  const state = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => (single ? store.state(single.id) : "off"),
    () => "off" as const,
  );
  const gif = objs.every((o) => o.kind === "gif");
  const clips = objs.some((o) => o.kind === "video");
  const muted = objs.every((o) => o.muted);
  const loop = objs.every((o) => o.loop);
  const kind = gif ? "GIF" : "video";
  const live = state !== "off";
  const ctx = commandCtx();
  const canPoster = !!single && single.kind === "video" && registry.available("video.setPoster", ctx);
  const canGrab = !!single && single.kind === "video" && registry.available("video.grabFrame", ctx);

  const toggle = (name: string, label: string, pressed: boolean, id: string, on: React.ReactNode, off: React.ReactNode) => (
    <Tip label={label} side={side}>
      <button type="button" aria-label={name} aria-pressed={pressed} onClick={() => void run(id)} className={chromeButton}>
        {pressed ? on : off}
      </button>
    </Tip>
  );
  const frameButton = (label: string, id: string, icon: React.ReactNode, enabled: boolean) => (
    <Tip label={label} side={side}>
      <button
        type="button"
        aria-label={label}
        aria-disabled={!enabled}
        onClick={() => {
          // Always runs: without a live frame the command explains what to do instead of doing nothing.
          void run(id);
        }}
        className={`${chromeButton} ${enabled ? "" : "opacity-60"}`}
      >
        {icon}
      </button>
    </Tip>
  );

  return (
    <>
      {single ? (
        <Tip label={state === "playing" ? `Pause ${kind}` : `Play ${kind}`} shortcut="Enter" side={side}>
          <button
            type="button"
            aria-label={state === "playing" ? `Pause ${kind}` : `Play ${kind}`}
            aria-keyshortcuts="Enter"
            onClick={() => void run("video.play")}
            className={chromeButton}
          >
            {state === "playing" ? <Pause aria-hidden="true" size={18} strokeWidth={1.75} /> : <Play aria-hidden="true" size={18} strokeWidth={1.75} />}
          </button>
        </Tip>
      ) : null}
      {!locked && clips ? (
        <>
          {toggle("Mute", muted ? "Unmute" : "Mute", muted, "video.toggleMute", <VolumeX aria-hidden="true" size={18} strokeWidth={1.75} />, <Volume2 aria-hidden="true" size={18} strokeWidth={1.75} />)}
          {toggle("Loop", loop ? "Stop looping" : "Loop", loop, "video.toggleLoop", <Repeat aria-hidden="true" size={18} strokeWidth={2.25} />, <Repeat aria-hidden="true" size={18} strokeWidth={1.75} />)}
        </>
      ) : null}
      {single && single.kind === "video" && live ? <SeekSlider id={single.id} /> : null}
      {!locked && canPoster ? frameButton("Use this frame as the poster", "video.setPoster", <ImageUp aria-hidden="true" size={18} strokeWidth={1.75} />, live) : null}
      {canGrab ? frameButton("Grab frame as image", "video.grabFrame", <Camera aria-hidden="true" size={18} strokeWidth={1.75} />, live) : null}
    </>
  );
}

/** A slider over the live video's length. Follows `timeupdate`; dragging it seeks. */
function SeekSlider({ id }: { id: string }) {
  const store = getPlaybackStore();
  const el = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.element(id),
    () => null,
  );
  const [time, setTime] = useState(() => el?.currentTime ?? 0);
  useEffect(() => {
    if (!el) return;
    const sync = () => setTime(el.currentTime);
    sync();
    el.addEventListener("timeupdate", sync);
    el.addEventListener("seeked", sync);
    return () => {
      el.removeEventListener("timeupdate", sync);
      el.removeEventListener("seeked", sync);
    };
  }, [el]);
  if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return null;
  return (
    <input
      type="range"
      aria-label="Seek"
      min={0}
      max={el.duration}
      step={0.1}
      value={Math.min(time, el.duration)}
      onChange={(e) => {
        const t = Number(e.target.value);
        const live = store.element(id);
        if (live) live.currentTime = t;
        setTime(t);
      }}
      className="mx-1 h-6 w-24 accent-(--color-selection) pointer-coarse:h-11"
    />
  );
}
