"use client";

import { useState } from "react";
import { CalendarDays, MapPin, Moon, Sun } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import type { ReminderChoice } from "@/lib/data";

const OPTIONS: { id: Exclude<ReminderChoice, "date">; label: string; hint: string; icon: typeof Moon }[] = [
  { id: "tonight", label: "Tonight", hint: "8 pm", icon: Moon },
  { id: "weekend", label: "This weekend", hint: "Saturday, 10 am", icon: Sun },
  { id: "nearby", label: "Next time I'm nearby", hint: "When you open Stash near the place", icon: MapPin },
];

export function RemindSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (choice: ReminderChoice, date?: string) => void;
}) {
  const [date, setDate] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Sheet open={open} onClose={onClose} label="Remind me" title="Remind me">
      <ul className="flex flex-col gap-1">
        {OPTIONS.map(({ id, label, hint, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onPick(id)}
              className="flex min-h-14 w-full items-center gap-3 rounded-card px-3 text-left hover:bg-raised"
            >
              <Icon size={24} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
              <span className="flex flex-col">
                <span className="text-body text-fg">{label}</span>
                <span className="text-caption text-fg-muted">{hint}</span>
              </span>
            </button>
          </li>
        ))}
        <li className="flex min-h-14 items-center gap-3 px-3">
          <CalendarDays size={24} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
          <label htmlFor="remind-date" className="text-body text-fg">
            Pick a date
          </label>
          <input
            id="remind-date"
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-card bg-raised px-3 text-input text-fg outline-none focus:ring-2 focus:ring-fg"
          />
          <button
            type="button"
            disabled={!date}
            onClick={() => onPick("date", date)}
            className="h-12 shrink-0 rounded-card bg-fg px-4 text-label text-background disabled:opacity-40"
          >
            Set
          </button>
        </li>
      </ul>
      <p className="px-3 pt-3 text-caption text-fg-muted">Reminder notifications switch on in the next update; your reminders are kept until then.</p>
    </Sheet>
  );
}
