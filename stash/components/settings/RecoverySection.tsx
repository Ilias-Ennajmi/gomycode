"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Smartphone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { QrCode } from "@/components/ui/QrCode";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { RecoveryFailure, createRecoveryCode, fetchRecoveryState, type RecoveryState } from "@/lib/recovery";
import { recoveryErrorText, recoveryLink } from "@/lib/recoveryCode";
import { RestoreSheet } from "./RestoreForm";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Settings → Move to a new phone. Makes a recovery code (shown once: copy it, or scan
 * its QR with the new phone) and offers "I have a recovery code" for the other direction.
 */
export function RecoverySection() {
  const { toast } = useToast();
  const [state, setState] = useState<RecoveryState>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchRecoveryState()
      .then((s) => alive && setState(s))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const create = async () => {
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      const made = await createRecoveryCode();
      haptic();
      setCode(made.code);
      setState({ createdAt: made.createdAt, lastRestoredAt: null });
    } catch (e) {
      setError(recoveryErrorText(e instanceof RecoveryFailure ? e.kind : "failed", "create"));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!code) return;
    void navigator.clipboard
      ?.writeText(code)
      .then(() => toast({ message: "Code copied. Paste it somewhere safe.", aboveBar: false }))
      .catch(() => toast({ message: "Couldn't copy. Write it down instead.", aboveBar: false }));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-pop">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised">
            <KeyRound size={22} strokeWidth={2} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-label text-fg">Recovery code</span>
            <span className="text-caption text-fg-muted" aria-live="polite">
              {!loaded
                ? "Checking…"
                : state
                  ? `Made on ${day(state.createdAt)}${state.lastRestoredAt ? ` · last used ${day(state.lastRestoredAt)}` : ""}. Stash doesn't keep the code itself.`
                  : "None yet. Without one, a lost or reset phone means starting again."}
            </span>
          </div>
        </div>
        <p className="text-body text-fg-muted">
          Stash has no login. A recovery code is the key to your saves: enter it on a new phone and everything is there.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-raised p-3 text-body text-danger">
            {error}
          </p>
        )}
        <Button icon={KeyRound} variant={state ? "secondary" : "ink"} loading={busy} onClick={() => (state ? setConfirm(true) : void create())}>
          {busy ? "Making the code…" : state ? "Make a new code" : "Create a recovery code"}
        </Button>
      </div>

      <button type="button" onClick={() => setRestoreOpen(true)} className="press flex min-h-14 items-center gap-3 rounded-xl bg-surface px-4 text-left shadow-pop">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised">
          <Smartphone size={22} strokeWidth={2} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-label text-fg">I have a recovery code</span>
          <span className="text-caption text-fg-muted">Bring another phone&apos;s Stash to this one</span>
        </span>
      </button>

      <Sheet open={confirm} onClose={() => setConfirm(false)} label="Make a new code" title="Make a new code?">
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-3 text-body text-fg">
            <TriangleAlert size={20} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
            The code you made before stops working. Phones that are already in keep working.
          </p>
          <Button variant="ink" fullWidth onClick={() => void create()}>
            Make a new code
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setConfirm(false)}>
            Keep the old one
          </Button>
        </div>
      </Sheet>

      <Sheet open={code !== null} onClose={() => setCode(null)} label="Your recovery code" title="Your recovery code">
        {code && (
          <div className="flex flex-col gap-4">
            <p className="flex items-start gap-3 rounded-lg bg-raised p-4 text-body text-fg">
              <TriangleAlert size={20} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                <strong className="text-label">Shown once.</strong> Keep it somewhere safe, like a password manager or on paper. Anyone with this code can open your Stash; without it, nobody can
                bring your saves back.
              </span>
            </p>
            <p
              aria-label={`Recovery code ${code.split("").join(" ")}`}
              className="grid select-all grid-cols-2 gap-x-4 gap-y-2 rounded-lg border-2 border-fg p-4 text-center font-mono text-title tracking-widest text-fg"
            >
              {code.split("-").map((group, i) => (
                <span key={i} aria-hidden>
                  {group}
                </span>
              ))}
            </p>
            <Button icon={Copy} variant="ink" fullWidth onClick={copy}>
              Copy the code
            </Button>
            <div className="flex flex-col items-center gap-2">
              <QrCode value={recoveryLink(window.location.origin, code)} label="QR of the recovery code" className="max-w-56" />
              <p className="text-center text-caption text-fg-muted">On the new phone: open Stash → I have a recovery code → Scan the QR. Or point its camera here.</p>
            </div>
            <Button variant="secondary" fullWidth onClick={() => setCode(null)}>
              I&apos;ve saved it
            </Button>
          </div>
        )}
      </Sheet>

      <RestoreSheet open={restoreOpen} onClose={() => setRestoreOpen(false)} />
    </div>
  );
}
