"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, Loader2, X } from "lucide-react";
import { loadPushStatus, turnOnPush } from "@/lib/push-client";

const DISMISSED_KEY = "push-prompt-dismissed";
const ASK_AGAIN_MS = 30 * 24 * 60 * 60 * 1000;
// Not the moment the app opens: after a short look around.
const DELAY_MS = 8000;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    return Date.now() - at < ASK_AGAIN_MS;
  } catch {
    return false;
  }
}

/**
 * Notifications only work once a device turns them on, which is easy to miss in Settings.
 * This asks once (again a month after "Not now") when this device could get them but doesn't.
 */
export function NotificationPrompt() {
  const [publicKey, setPublicKey] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (dismissedRecently()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    const timer = setTimeout(() => {
      loadPushStatus()
        .then((status) => {
          if (status?.configured && status.publicKey && !status.subscribed) {
            setPublicKey(status.publicKey);
          }
        })
        .catch(() => {
          // Can't tell: don't ask.
        });
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!publicKey) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Hidden for this visit only.
    }
    setPublicKey(null);
  }

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    try {
      await turnOnPush(publicKey);
      toast.success("Notifications are on. Choose which ones in Settings.");
      setPublicKey(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not turn on notifications");
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 animate-fade-in items-center gap-3 border-b bg-primary/10 px-4 py-2.5 text-sm">
      <BellRing className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 leading-snug">
        Get the morning briefing, breaking news and snoozed articles as notifications.
      </p>
      <button
        type="button"
        onClick={turnOn}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-70"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Turn on
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Not now"
        title="Not now"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
