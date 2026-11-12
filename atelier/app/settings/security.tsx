"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  errorClass,
  helpClass,
  inputClass,
  labelClass,
} from "@/components/ui/controls";

export type VerifiedFactor = { id: string; name: string };

type Enrolment = { factorId: string; qr: string; secret: string };

const BAD_CODE = "That code didn't work. Check the 6 digits and try again.";

/** "ABCDEFGHIJKLMNOP" -> "ABCD EFGH IJKL MNOP", easier to type from a screen. */
const groupKey = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

export function Security({ initialFactors }: { initialFactors: VerifiedFactor[] }) {
  const router = useRouter();
  const [factors, setFactors] = useState(initialFactors);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  // The confirmation is a native <dialog>: modal, focus-trapped, closes on Escape.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirming && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      keepRef.current?.focus();
    } else if (!confirming && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [confirming]);

  const supabase = createBrowserClient();
  if (!supabase) {
    return (
      <section aria-labelledby="security-heading" className="rounded-lg bg-panel p-6 shadow-1">
        <h2 id="security-heading" className="mb-2 text-(length:--text-lg) font-semibold text-fg">
          Security
        </h2>
        <p className="text-fg-muted">Sign-in isn&apos;t set up on this server.</p>
      </section>
    );
  }
  const mfa = supabase.auth.mfa;
  const enabled = factors.length > 0;

  async function startEnrol() {
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      // An abandoned earlier attempt would block a new one with the same name; clear it first.
      const existing = await mfa.listFactors();
      for (const f of existing.data?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") await mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
        issuer: "Atelier",
      });
      if (enrollError || !data) throw enrollError ?? new Error("enroll failed");
      const svg = await QRCode.toString(data.totp.uri, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
      setEnrolment({
        factorId: data.id,
        qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        secret: data.totp.secret,
      });
      setCode("");
    } catch {
      setError("Couldn't start setup. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnrol() {
    const current = enrolment;
    setEnrolment(null);
    setCode("");
    setError(null);
    if (current) await mfa.unenroll({ factorId: current.factorId });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolment) return;
    const digits = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(digits)) {
      setError("Enter the 6 digits from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } = await mfa.challengeAndVerify({ factorId: enrolment.factorId, code: digits });
    setBusy(false);
    if (verifyError) {
      setError(BAD_CODE);
      return;
    }
    setFactors([{ id: enrolment.factorId, name: "Authenticator app" }]);
    setEnrolment(null);
    setCode("");
    setStatus("Two-step verification is on.");
    router.refresh();
  }

  async function remove() {
    const factor = factors[0];
    if (!factor) return;
    setBusy(true);
    setError(null);
    const { error: removeError } = await mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    setConfirming(false);
    if (removeError) {
      setError("Couldn't remove it just now. Try again in a moment.");
      return;
    }
    await supabase!.auth.refreshSession();
    setFactors([]);
    setStatus("Two-step verification is off.");
    router.refresh();
  }

  return (
    <section aria-labelledby="security-heading" className="rounded-lg bg-panel p-6 shadow-1">
      <h2 id="security-heading" className="mb-1 text-(length:--text-lg) font-semibold text-fg">
        Security
      </h2>
      <h3 className="mt-4 text-(length:--text-md) font-medium text-fg">Two-step verification</h3>
      <p className={`${helpClass} mb-4 max-w-prose`}>
        {enabled
          ? "Two-step verification is on. After your password, Atelier asks for a code from your authenticator app."
          : "Two-step verification is off. Turn it on to also ask for a code from an authenticator app when you sign in."}
      </p>

      {/* Polite live region: the result of the last change. */}
      <p role="status" aria-live="polite" className="mb-4 min-h-6 text-(length:--text-sm) font-medium text-fg">
        {status}
      </p>

      {!enabled && !enrolment ? (
        <button type="button" className={buttonPrimary} onClick={startEnrol} disabled={busy}>
          Set up two-step verification
        </button>
      ) : null}

      {enrolment ? (
        <form onSubmit={verify} className="flex max-w-sm flex-col gap-4" noValidate>
          <p className="text-(length:--text-sm) text-fg">
            Scan this QR code with an authenticator app, then enter the 6-digit code it shows.
          </p>
          <Image
            src={enrolment.qr}
            alt="QR code for setting up your authenticator app"
            width={192}
            height={192}
            unoptimized
            className="rounded-md"
          />
          <div>
            <p className={helpClass}>Can&apos;t scan it? Enter this key in your app instead:</p>
            <code className="mt-1 block select-all break-all rounded-md border border-line bg-canvas px-3 py-2 text-(length:--text-sm) text-fg">
              {groupKey(enrolment.secret)}
            </code>
          </div>
          <div>
            <label htmlFor="mfa-code" className={labelClass}>
              6-digit code
            </label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} tracking-widest`}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "mfa-error" : undefined}
            />
            {error ? (
              <p id="mfa-error" role="alert" className={errorClass}>
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex gap-3">
            <button type="submit" className={buttonPrimary} disabled={busy}>
              Turn on
            </button>
            <button type="button" className={buttonSecondary} onClick={cancelEnrol} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}

      {enabled ? (
        <button type="button" className={buttonSecondary} onClick={() => setConfirming(true)} disabled={busy}>
          Remove two-step verification
        </button>
      ) : null}

      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby="remove-title"
        aria-describedby="remove-text"
        onClose={() => setConfirming(false)}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-lg bg-panel p-6 text-fg shadow-3 backdrop:bg-(--color-scrim)"
      >
        <h3 id="remove-title" className="mb-2 text-(length:--text-lg) font-semibold">
          Remove two-step verification?
        </h3>
        <p id="remove-text" className="mb-6 text-(length:--text-sm) text-fg-muted">
          Anyone with your password will be able to open Atelier. You can set it up again at any time.
        </p>
        <div className="flex justify-end gap-3">
          <button ref={keepRef} type="button" className={buttonSecondary} onClick={() => setConfirming(false)}>
            Keep it on
          </button>
          <button type="button" className={buttonDanger} onClick={remove} disabled={busy}>
            Remove
          </button>
        </div>
      </dialog>
    </section>
  );
}
