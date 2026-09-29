"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { loadPushStatus, turnOnPush, type PushStatus } from "@/lib/push-client";

type Support = "checking" | "unsupported" | "ready";

/**
 * Notifications on this device (web push; inside the Android app they show up as the app's
 * own). The two kinds apply to every device.
 */
export function NotificationSettings() {
  const [support, setSupport] = React.useState<Support>("checking");
  const [status, setStatus] = React.useState<PushStatus | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const next = await loadPushStatus();
    if (!next) {
      setSupport("unsupported");
      return;
    }
    setStatus(next);
    setSupport("ready");
  }, []);

  React.useEffect(() => {
    load().catch(() => setSupport("unsupported"));
  }, [load]);

  async function turnOn() {
    if (!status?.publicKey) return;
    setBusy(true);
    try {
      await turnOnPush(status.publicKey);
      setStatus({ ...status, subscribed: true });
      toast.success("Notifications are on");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not turn on notifications");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!status) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus({ ...status, subscribed: false });
    } finally {
      setBusy(false);
    }
  }

  async function setPref(key: "briefing" | "breaking" | "recap", value: boolean) {
    if (!status) return;
    setStatus({ ...status, prefs: { ...status.prefs, [key]: value } });
    const res = await fetch("/api/push", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    if (!res.ok) {
      toast.error("Could not save that setting");
      load();
    }
  }

  async function sendTest() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(body.error || "Could not send a test");
    else toast.success("Test sent. It should arrive in a few seconds.");
  }

  if (support === "checking") {
    return <p className="px-3 py-2.5 text-sm text-muted-foreground">Checking…</p>;
  }
  if (support === "unsupported") {
    return (
      <p className="px-3 py-2.5 text-sm text-muted-foreground">
        Notifications aren’t available here. Use the Android app or an up-to-date browser.
      </p>
    );
  }
  if (!status?.configured) {
    return (
      <p className="px-3 py-2.5 text-sm text-muted-foreground">
        Notifications aren’t set up on the server yet.
      </p>
    );
  }

  return (
    <div className="divide-y">
      <label className="flex items-center gap-3 px-3 py-2.5">
        <BellRing className="h-5 w-5 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">Notifications on this device</span>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Switch
          checked={status.subscribed}
          disabled={busy}
          onCheckedChange={(on) => (on ? turnOn() : turnOff())}
        />
      </label>
      {status.subscribed && (
        <>
          <label className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex-1">
              <span className="block text-sm">Morning briefing</span>
              <span className="block text-xs text-muted-foreground">
                Around 7:00, the day’s top stories
              </span>
            </span>
            <Switch
              checked={status.prefs.briefing}
              onCheckedChange={(value) => setPref("briefing", value)}
            />
          </label>
          <label className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex-1">
              <span className="block text-sm">Breaking news</span>
              <span className="block text-xs text-muted-foreground">
                When many outlets suddenly cover the same story
              </span>
            </span>
            <Switch
              checked={status.prefs.breaking}
              onCheckedChange={(value) => setPref("breaking", value)}
            />
          </label>
          <label className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex-1">
              <span className="block text-sm">Weekly recap</span>
              <span className="block text-xs text-muted-foreground">
                Sunday evening, your week in reading
              </span>
            </span>
            <Switch
              checked={status.prefs.recap}
              onCheckedChange={(value) => setPref("recap", value)}
            />
          </label>
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Snoozed articles always notify you when they come back.
          </p>
          <div className="px-3 py-2">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={sendTest}>
              Send a test notification
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
