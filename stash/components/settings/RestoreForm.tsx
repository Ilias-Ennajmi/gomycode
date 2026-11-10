"use client";

import { useEffect, useRef, useState } from "react";
import { ScanQrCode, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { getBrowserClient } from "@/lib/supabase/client";
import { RecoveryFailure, restoreFromCode } from "@/lib/recovery";
import { codeHint, extractCode, formatCode, isValidCode, recoveryErrorText } from "@/lib/recoveryCode";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;
const detectorCtor = (): DetectorCtor | null =>
  typeof window !== "undefined" && "BarcodeDetector" in window ? (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector : null;

/** Reads a recovery QR with the camera. Only offered where the browser can (Chrome on Android can). */
function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const Ctor = detectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      // Checked before the scanner is offered; this is a late fallback.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProblem("This browser can't scan codes. Type the code instead.");
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let alive = true;
    const detector = new Ctor({ formats: ["qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        void v.play().catch(() => {});
        timer = setInterval(() => {
          if (v.readyState < 2) return;
          void detector
            .detect(v)
            .then((found) => {
              for (const f of found) {
                const code = extractCode(f.rawValue);
                if (code) {
                  onCode(code);
                  return;
                }
              }
            })
            .catch(() => {});
        }, 350);
      })
      .catch(() => setProblem("Stash can't use the camera. Allow it in the phone's settings, or type the code."));
    return () => {
      alive = false;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-[var(--scrim-base)]">
      {problem ? (
        <p className="p-4 pr-14 text-body" style={{ color: "var(--ink-light)" }}>
          {problem}
        </p>
      ) : (
        <>
          <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
          <span aria-hidden className="pointer-events-none absolute inset-8 rounded-lg border-4" style={{ borderColor: "var(--ink-light)" }} />
          <p className="absolute inset-x-0 bottom-2 text-center text-caption" style={{ color: "var(--ink-light)" }}>
            Point at the QR on your other phone
          </p>
        </>
      )}
      <IconButton label="Stop scanning" icon={X} variant="raised" className="absolute right-2 top-2" onClick={onClose} />
    </div>
  );
}

/**
 * "I have a recovery code": type or scan it, and this phone becomes that Stash.
 * Says clearly what happens to saves already on this phone before doing anything.
 */
export function RestoreForm({ initialCode, autoFocus }: { initialCode?: string; autoFocus?: boolean }) {
  const [code, setCode] = useState(() => formatCode(initialCode ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const [existing, setExisting] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Capabilities and counts are only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanScan(Boolean(detectorCtor() && navigator.mediaDevices?.getUserMedia));
    let alive = true;
    void (async () => {
      // Only look when this phone already has an identity (never create one just to count).
      const supabase = getBrowserClient();
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!supabase || !session) return;
      const { count } = await supabase.from("saves").select("id", { count: "exact", head: true });
      if (alive) setExisting(count ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const valid = isValidCode(code);
  const hint = error ?? codeHint(code);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await restoreFromCode(code);
      setDone(true);
      // A full reload: every screen starts again as the restored Stash.
      window.location.replace("/today");
    } catch (e) {
      setError(recoveryErrorText(e instanceof RecoveryFailure ? e.kind : "failed", "restore"));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-body text-fg-muted">Enter the code you made on your other phone (Settings → Move to a new phone). Your saves, Spaces and recall cards come with it.</p>

      {scanning ? (
        <Scanner
          onClose={() => setScanning(false)}
          onCode={(c) => {
            setCode(c);
            setError(null);
            setScanning(false);
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor="recovery-code" className="text-label text-fg">
            Recovery code
          </label>
          <input
            id="recovery-code"
            value={code}
            autoFocus={autoFocus}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            aria-invalid={error ? true : undefined}
            aria-describedby="recovery-code-note"
            onChange={(e) => {
              setCode(formatCode(extractCode(e.target.value) ?? e.target.value));
              setError(null);
            }}
            className={cx(
              "h-14 w-full rounded-card border bg-raised px-4 font-mono text-input tracking-wider text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-fg",
              error ? "border-danger" : "border-transparent",
            )}
          />
          <span id="recovery-code-note" role={error ? "alert" : undefined} className={cx("min-h-5 text-caption", error ? "text-danger" : "text-fg-muted")}>
            {hint ?? (valid ? "That looks right." : "20 letters and digits. Dashes and spaces don't matter.")}
          </span>
          {canScan && (
            <Button variant="secondary" icon={ScanQrCode} onClick={() => setScanning(true)} className="self-start">
              Scan the QR instead
            </Button>
          )}
        </div>
      )}

      {existing !== null && existing > 0 && (
        <p className="flex items-start gap-3 rounded-lg bg-raised p-4 text-body text-fg">
          <TriangleAlert size={20} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            This phone already has {existing} {existing === 1 ? "save" : "saves"}. After restoring you will see the other Stash instead; {existing === 1 ? "this save stays" : "these saves stay"} with
            this phone&apos;s old id and won&apos;t show here.
          </span>
        </p>
      )}

      <Button type="submit" size="lg" fullWidth disabled={!valid} loading={busy}>
        {done ? "Restored. Opening…" : busy ? "Restoring…" : "Restore my Stash"}
      </Button>
    </form>
  );
}

export function RestoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="I have a recovery code" title="I have a recovery code">
      <RestoreForm />
    </Sheet>
  );
}
