"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { haptic } from "@/lib/haptics";

const MAX_MS = 30_000;

function pickType(): string | undefined {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
}

/** Hold to record "why I saved it" (up to 30 s). Release to keep it. */
export function VoiceNoteButton({
  onRecorded,
  onProblem,
  done,
  className,
}: {
  onRecorded: (blob: Blob, mime: string) => void;
  onProblem: (message: string) => void;
  done?: boolean;
  className?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const chunks = useRef<Blob[]>([]);

  const stop = () => {
    clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  };

  useEffect(() => () => stop(), []);

  const start = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      onProblem("Voice notes aren't supported here.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickType();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = (r.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(chunks.current, { type });
        if (blob.size > 2000) onRecorded(blob, type);
      };
      rec.current = r;
      r.start();
      haptic();
      setRecording(true);
      const t0 = Date.now();
      setElapsed(0);
      timer.current = setInterval(() => {
        const ms = Date.now() - t0;
        setElapsed(ms);
        if (ms >= MAX_MS) stop();
      }, 200);
    } catch {
      onProblem("Microphone access is off for Stash.");
    }
  };

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        void start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={recording ? "Recording, release to keep" : "Hold to record why you saved it"}
      className={cx(
        "flex h-12 select-none touch-none items-center justify-center gap-2 rounded-card border px-4 text-label",
        recording ? "border-fg bg-fg text-background" : "border-line text-fg",
        className,
      )}
    >
      <Mic size={24} strokeWidth={2} aria-hidden className={recording ? "animate-pulse" : undefined} />
      <span className="truncate">
        {recording ? `Recording ${Math.floor(elapsed / 1000)}s` : done ? "Voice note saved" : "Why I saved it"}
      </span>
    </button>
  );
}
