"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  not_allowed: "This Google account isn't allowed in Stash.",
  auth_failed: "Sign-in didn't complete. Try again.",
};

export function LoginCard() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const error = params.get("error");
  const next = params.get("next") ?? "/today";

  async function signIn() {
    const supabase = getBrowserClient();
    if (!supabase) return setFailed(true);
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <div aria-hidden className="flex h-16 w-16 items-center justify-center rounded-xl bg-fg text-background">
        <span className="font-display text-title">S</span>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-display">Stash</h1>
        <p className="text-body text-fg-muted">Save reels. Watch them. Remember them. Use them.</p>
      </div>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="tap flex w-full items-center justify-center gap-2 rounded-card bg-accent px-6 text-label text-on-accent transition-opacity duration-[var(--dur-fast)] disabled:opacity-60"
      >
        <LogIn size={24} strokeWidth={2} aria-hidden />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {(error || failed) && (
        <p role="alert" className="text-caption text-danger">
          {ERRORS[error ?? ""] ?? "Sign-in isn't set up yet."}
        </p>
      )}
    </div>
  );
}
