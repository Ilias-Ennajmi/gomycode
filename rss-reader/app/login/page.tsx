"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fingerprint, Loader2, Rss } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";

function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // Whether a passkey can unlock this reader from this browser.
  const [passkey, setPasskey] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);

  const enter = React.useCallback(() => {
    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/reader");
    router.refresh();
  }, [router, searchParams]);

  React.useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    fetch("/api/auth/passkey/login")
      .then((res) => res.json())
      .then((body) => setPasskey(Boolean(body.available)))
      .catch(() => undefined);
  }, []);

  async function unlock() {
    setUnlocking(true);
    setError(null);
    try {
      // A fresh challenge each time: the one from page load may have expired.
      const start = await (await fetch("/api/auth/passkey/login")).json();
      if (!start.available) throw new Error("No passkey is set up");
      const response = await startAuthentication({ optionsJSON: start.options });
      const res = await fetch("/api/auth/passkey/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not sign in");
      }
      enter();
    } catch (error) {
      // Dismissing the phone's prompt isn't an error worth showing.
      if ((error as Error).name !== "NotAllowedError") setError((error as Error).message);
    } finally {
      setUnlocking(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Could not sign in");
        return;
      }
      enter();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Rss className="h-6 w-6" />
        </div>
        <div>
          <h1 className="tracking-tight text-2xl font-bold">{t("Welcome back")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Enter your password to open your reader.")}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t("Password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p id="login-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <Button type="submit" className="h-11 w-full" disabled={!password || submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Sign in")}
      </Button>
      {passkey && (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2"
          disabled={unlocking}
          onClick={() => void unlock()}
        >
          {unlocking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Fingerprint className="h-4 w-4" />
          )}
          {t("Unlock with a passkey")}
        </Button>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <React.Suspense>
        <LoginForm />
      </React.Suspense>
    </main>
  );
}
