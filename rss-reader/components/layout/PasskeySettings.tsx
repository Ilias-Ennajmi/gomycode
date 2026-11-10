"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { useT } from "@/lib/i18n";

// Settings → App: unlock with the phone's fingerprint, face or PIN instead of typing the
// password (lib/passkeys.ts). The password keeps working.

interface Listed {
  id: string;
  name: string;
  addedAt: number;
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android phone";
  if (/iPhone|iPad/i.test(ua)) return "iPhone or iPad";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  return "This device";
}

export function PasskeySettings() {
  const { t } = useT();
  const { data, mutate } = useSWR<{ passkeys: Listed[] }>("/api/auth/passkey");
  const [busy, setBusy] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  React.useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  if (!supported) return null;
  const passkeys = data?.passkeys ?? [];

  async function add() {
    setBusy(true);
    try {
      const start = await fetch("/api/auth/passkey/register");
      const options = await start.json();
      if (!start.ok) throw new Error(options.error);
      const response = await startRegistration({ optionsJSON: options });
      const res = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, name: deviceName() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error);
      await mutate(body, { revalidate: false });
      toast.success(t("Passkey added: next time, unlock without the password"));
    } catch (error) {
      const name = (error as Error).name;
      // Dismissed, or this device already has one.
      if (name === "InvalidStateError") toast(t("This device already has a passkey"));
      else if (name !== "NotAllowedError") {
        toast.error((error as Error).message || t("Couldn't add the passkey"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/auth/passkey?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) await mutate(await res.json(), { revalidate: false });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void add()}
        disabled={busy}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-accent/60"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Fingerprint className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("Add a passkey")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("Unlock with your fingerprint, face or PIN instead of the password")}
          </span>
        </span>
      </button>
      {passkeys.length > 0 && (
        <ul aria-label={t("Passkeys")}>
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center gap-3 py-1.5 pl-12 pr-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {passkey.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {new Date(passkey.addedAt).toLocaleDateString()}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(passkey.id)}
                aria-label={`${t("Remove passkey")}: ${passkey.name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
