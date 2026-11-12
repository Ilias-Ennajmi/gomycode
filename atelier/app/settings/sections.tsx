"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { signOut } from "@/app/login/verify/actions";
import { buttonPrimary, buttonSecondary, helpClass } from "@/components/ui/controls";
import { DEFAULT_NAV_SETTINGS, loadSettings, sanitizeSettings, saveSettings, type NavSettings } from "@/lib/settings";
import { getTheme, setTheme, type ThemePreference } from "@/lib/theme";

/* The settings sections beside Security. Each one is a card; everything is stored on this device. */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg bg-panel p-6 shadow-1">
      <h2 id={id} className="mb-4 text-(length:--text-lg) font-semibold text-fg">
        {title}
      </h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** Pill-shaped choice built from native radio buttons (keyboard and screen reader behaviour for free). */
function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-(length:--text-sm) font-medium text-fg">{legend}</legend>
      <div className="inline-flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="inline-flex min-h-11 min-w-20 select-none items-center justify-center rounded-md border border-line bg-canvas px-4 text-(length:--text-md) transition-[transform,background-color,border-color] duration-(--dur-fast) ease-out peer-checked:border-brand peer-checked:bg-(--color-selection-fill) peer-checked:font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-select active:scale-[0.97] hoverable:border-fg-muted">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Check({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={help ? `${id}-help` : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 accent-brand pointer-coarse:size-6"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block min-h-6 text-(length:--text-md) text-fg">
          {label}
        </label>
        {help ? (
          <p id={`${id}-help`} className={helpClass}>
            {help}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---- Appearance -----------------------------------------------------------------------------------------

export function Appearance() {
  const [pref, setPref] = useState<ThemePreference>("system");
  // Read after mount: the server render cannot know this device's choice.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from this device's storage
  useEffect(() => setPref(getTheme()), []);
  return (
    <Section id="appearance-heading" title="Appearance">
      <Choice
        legend="Theme"
        value={pref}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        onChange={(p) => {
          setTheme(p);
          setPref(p);
        }}
      />
      <p className={helpClass}>System follows your device and switches with it.</p>
    </Section>
  );
}

// ---- Navigation -----------------------------------------------------------------------------------------

export function Navigation() {
  const [s, setS] = useState<NavSettings>(DEFAULT_NAV_SETTINGS);
  const sliderId = useId();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from this device's storage after mount
  useEffect(() => setS(loadSettings()), []);
  const update = (patch: Partial<NavSettings>) => {
    const next = sanitizeSettings({ ...s, ...patch });
    setS(next);
    saveSettings(next);
  };
  return (
    <Section id="navigation-heading" title="Navigation">
      <Choice
        legend="Mouse wheel"
        value={s.wheel}
        options={[
          { value: "zoom", label: "Zoom" },
          { value: "pan", label: "Pan" },
        ]}
        onChange={(wheel) => update({ wheel })}
      />
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label htmlFor={sliderId} className="text-(length:--text-sm) font-medium text-fg">
            Zoom speed
          </label>
          <output htmlFor={sliderId} className="text-(length:--text-sm) tabular-nums text-fg-muted">
            {s.sensitivity.toFixed(1)}×
          </output>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={s.sensitivity}
          aria-valuetext={`${s.sensitivity.toFixed(1)} times`}
          onChange={(e) => update({ sensitivity: Number(e.target.value) })}
          className="block min-h-11 w-full accent-brand"
        />
        <p className={helpClass}>How far one wheel notch or pinch zooms. Left is slower, right is faster.</p>
      </div>
      <Check
        label="Lock wheel behaviour"
        help="Off: trackpads pan and pinch to zoom, and a mouse wheel follows the setting above. On: the setting above applies to every wheel event."
        checked={s.locked}
        onChange={(locked) => update({ locked })}
      />
      <Check
        label="Snap to edges and centres by default"
        help="Objects snap to each other while you drag. Hold Ctrl or ⌘ to skip it for one drag."
        checked={s.snap}
        onChange={(snap) => update({ snap })}
      />
      <Check
        label="Pen draws, finger pans"
        help="On a tablet, only the pen draws and a finger moves the canvas."
        checked={s.penOnlyDraws}
        onChange={(penOnlyDraws) => update({ penOnlyDraws })}
      />
    </Section>
  );
}

// ---- Storage --------------------------------------------------------------------------------------------

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return i === 0 ? `${Math.round(n)} B` : `${n.toFixed(1)} ${units[i]}`;
}

type StorageInfo = { usage: number; quota: number } | null;

export function Storage({ localOnly }: { localOnly: boolean }) {
  const [supported, setSupported] = useState(true);
  const [info, setInfo] = useState<StorageInfo>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [asked, setAsked] = useState<"idle" | "refused">("idle");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
      if (!storage) {
        if (alive) setSupported(false);
        return;
      }
      try {
        const e = await storage.estimate?.();
        if (alive && e) setInfo({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
      } catch {
        /* no estimate */
      }
      try {
        const p = await storage.persisted?.();
        if (alive && typeof p === "boolean") setPersisted(p);
      } catch {
        /* unknown */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function keep() {
    setBusy(true);
    try {
      const granted = await navigator.storage.persist();
      setPersisted(granted);
      setAsked(granted ? "idle" : "refused");
    } catch {
      setAsked("refused");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="storage-heading" title="Storage">
      {!supported ? (
        <p className="text-fg-muted">This browser can&apos;t report storage use.</p>
      ) : (
        <>
          {info && info.quota > 0 ? (
            <div>
              <p className="mb-2 text-(length:--text-md) text-fg">
                {formatBytes(info.usage)} of {formatBytes(info.quota)} used on this device
              </p>
              <progress
                aria-label="Storage used"
                value={info.usage}
                max={info.quota}
                className="block h-2 w-full appearance-none overflow-hidden rounded-sm [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand"
              />
            </div>
          ) : null}
          {persisted !== null ? (
            <p role="status" className="text-(length:--text-md) text-fg">
              {persisted
                ? "Protected: your browser won't clear Atelier's saved boards to free up space."
                : "Not protected: your browser may clear Atelier's saved boards when space runs low."}
            </p>
          ) : null}
          {asked === "refused" ? (
            <p role="status" className="text-(length:--text-sm) text-alert">
              Your browser didn&apos;t allow it. Installing Atelier to your Home Screen usually does.
            </p>
          ) : null}
          {persisted === false || asked === "refused" ? (
            <div>
              <button type="button" className={buttonSecondary} disabled={busy} onClick={keep}>
                Keep my data on this device
              </button>
            </div>
          ) : null}
        </>
      )}
      <p className={helpClass}>
        {localOnly
          ? "Local-only mode: this device holds the only copy of your boards."
          : "Your boards are also saved to your account, so a device that loses its data can be rebuilt from it."}{" "}
        On iPhone and iPad, Safari can clear a website&apos;s data after a week without use; adding Atelier to your Home Screen keeps it safe.
      </p>
    </Section>
  );
}

// ---- Account --------------------------------------------------------------------------------------------

/** Forget what the offline cache kept for this person (pages and pictures) before signing out. */
async function clearPrivateCaches(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("atelier-pages-") || n === "atelier-images").map((n) => caches.delete(n)));
  } catch {
    /* nothing to clear */
  }
}

export function Account({ localOnly }: { localOnly: boolean }) {
  const [busy, setBusy] = useState(false);
  async function leave() {
    setBusy(true);
    try {
      await clearPrivateCaches();
      await signOut(); // redirects to the login page
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section id="account-heading" title="Account">
      {localOnly ? (
        <p className="text-fg-muted">Local-only mode has no account, so there is nothing to sign out of.</p>
      ) : (
        <>
          <p className={helpClass}>Signing out of this device keeps the boards saved on it.</p>
          <div>
            <button type="button" className={buttonPrimary} disabled={busy} onClick={leave}>
              Sign out
            </button>
          </div>
        </>
      )}
    </Section>
  );
}
