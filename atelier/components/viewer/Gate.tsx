"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { UnlockResult } from "@/lib/viewer/viewer-client";

/** One calm screen for every dead link: the same words whether the link was turned off, has expired or never existed. */
export function Unavailable() {
  return (
    <main className="vw-center" data-gate="gone">
      <h1 className="vw-serif vw-h1">This link isn&apos;t available</h1>
      <p className="vw-muted">Check the address, or ask the studio to send it again.</p>
    </main>
  );
}

export function ErrorScreen({ onRetry, offline }: { onRetry: () => void; offline?: boolean }) {
  return (
    <main className="vw-center" data-gate="error">
      <h1 className="vw-serif vw-h1">{offline ? "You’re offline" : "Something went wrong"}</h1>
      <p className="vw-muted">{offline ? "Reconnect to the internet and this page will pick up where you left off." : "We couldn’t load this board. Check your connection and try again."}</p>
      <button type="button" className="vw-btn vw-btn-primary" onClick={onRetry}>
        Try again
      </button>
    </main>
  );
}

/** Seconds left until `until` (epoch ms), ticking once a second; 0 when there is nothing to wait for. */
function useSecondsUntil(until: number | null): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return [until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)), () => setNow(Date.now())];
}

type Notice = { kind: "wrong" | "locked" | "busy" | "error"; until: number | null } | null;

export function PasswordGate({ studioName, onUnlock }: { studioName: string; onUnlock: (password: string) => Promise<UnlockResult> }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [left, syncClock] = useSecondsUntil(notice?.until ?? null);
  const locked = notice !== null && left > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || locked || password.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await onUnlock(password);
      if (!r.ok) {
        setNotice({ kind: r.reason === "gone" ? "error" : r.reason, until: r.retryAfter > 0 ? Date.now() + r.retryAfter * 1000 : null });
        syncClock();
      }
    } catch {
      setNotice({ kind: "error", until: null });
    } finally {
      setBusy(false);
    }
  }

  const message =
    notice === null
      ? ""
      : notice.kind === "wrong"
        ? left > 0
          ? `That password isn’t right. Try again in ${left}s.`
          : "That password isn’t right."
        : notice.kind === "locked" || notice.kind === "busy"
          ? left > 0
            ? `Too many attempts. Try again in ${left}s.`
            : "You can try again now."
          : "We couldn’t check the password. Check your connection and try again.";

  return (
    <main className="vw-center" data-gate="password">
      {studioName ? <p className="vw-eyebrow">{studioName}</p> : null}
      <h1 className="vw-serif vw-h1">This board is private</h1>
      <p className="vw-muted">Enter the password the studio sent you.</p>
      <form className="vw-form" onSubmit={submit} noValidate>
        <label htmlFor={`${id}-pw`} className="vw-label">
          Password
        </label>
        <div className="vw-field">
          <input
            id={`${id}-pw`}
            name="password"
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={notice?.kind === "wrong" ? true : undefined}
            aria-describedby={`${id}-msg`}
            className="vw-input"
            maxLength={128}
          />
          <button type="button" className="vw-icon-btn" aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
            {shown ? <EyeOff aria-hidden="true" size={18} strokeWidth={1.75} /> : <Eye aria-hidden="true" size={18} strokeWidth={1.75} />}
          </button>
        </div>
        <p id={`${id}-msg`} role="status" aria-live="polite" className={notice ? "vw-error" : "vw-sr"}>
          {message}
        </p>
        <button type="submit" className="vw-btn vw-btn-primary" disabled={busy || locked || password.length === 0}>
          {busy ? "Checking…" : "Open board"}
        </button>
      </form>
    </main>
  );
}
