"use client";

import { useEffect, useId, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deviceTimeZone, fetchLoopSettings, readLoopSettings, saveLoopSettings, type LoopSettings } from "@/lib/loop";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { getBrowserClient } from "@/lib/supabase/client";

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <label htmlFor={id} className="text-body text-fg">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-12 rounded-card bg-raised px-3 text-input text-fg outline-none focus:ring-2 focus:ring-fg"
      />
    </div>
  );
}

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: "This browser can't show notifications.",
  denied: "Notifications are blocked for Stash. Allow them in the phone's settings for Stash.",
  off: "Reminders and your daily queue can notify you.",
  on: "On for this phone.",
};

/** Settings → Reminders: daily queue time, quiet hours and notifications on this phone. */
export function ReminderSettings() {
  const { toast } = useToast();
  const [s, setS] = useState<LoopSettings>(() => readLoopSettings());
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setPush).catch(() => setPush("unsupported"));
    if (!getBrowserClient()) return;
    void fetchLoopSettings()
      .then((remote) => {
        setS(remote);
        // Times are read in the phone's time zone; keep it current (travel, a new phone).
        const tz = deviceTimeZone();
        if (remote.timezone !== tz) void saveLoopSettings({ timezone: tz }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  const save = (patch: Partial<LoopSettings>) => {
    setS((prev) => ({ ...prev, ...patch }));
    if (!getBrowserClient()) return;
    void saveLoopSettings({ ...patch, timezone: deviceTimeZone() }).catch(() => toast({ message: "Couldn't save. Try again when online." }));
  };

  const togglePush = async () => {
    setBusy(true);
    try {
      if (push === "on") {
        setPush(await disablePush());
        return;
      }
      const r = await enablePush();
      if (r === "not-ready") toast({ message: "Notifications switch on within a few minutes of setup. Try again soon." });
      else if (r === "error") toast({ message: "Couldn't switch notifications on. Try again." });
      else setPush(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <TimeRow label="Daily queue time" value={s.queueTime} onChange={(v) => save({ queueTime: v })} />
      <p className="text-caption text-fg-muted">Your queue for the day is ready from this time.</p>
      <TimeRow label="Quiet from" value={s.quietHours.start} onChange={(v) => save({ quietHours: { ...s.quietHours, start: v } })} />
      <TimeRow label="Quiet until" value={s.quietHours.end} onChange={(v) => save({ quietHours: { ...s.quietHours, end: v } })} />
      <p className="text-caption text-fg-muted">No notifications in quiet hours; reminders wait until they end.</p>
      <div className="flex flex-col gap-2 pt-2">
        <p className="text-body text-fg">Notifications</p>
        <p className="text-caption text-fg-muted">{push ? PUSH_TEXT[push] : " "}</p>
        {push !== "unsupported" && push !== "denied" && push !== null && (
          <Button
            variant={push === "on" ? "secondary" : "primary"}
            icon={push === "on" ? BellOff : Bell}
            loading={busy}
            onClick={() => void togglePush()}
            className="self-start"
          >
            {push === "on" ? "Turn off on this phone" : "Enable notifications"}
          </Button>
        )}
      </div>
    </div>
  );
}
