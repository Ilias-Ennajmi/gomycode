"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { readPref, subscribePref, usePref } from "@/lib/prefs";

// Reading comfort: the little things that make long reading easier on some eyes and
// hands. Shared preferences, like the rest of Personalise.

export interface Comfort {
  /** Bionic reading: the first part of each word in bold, to pull the eye along. */
  bionic: boolean;
  /** Bigger buttons and rows for thumbs that miss. */
  bigTargets: boolean;
  /** Dark theme after sunset, light before, worked out from the clock (and location when shared). */
  autoDark: boolean;
}

const KEY = "comfort";
const DEFAULT: Comfort = { bionic: false, bigTargets: false, autoDark: false };
const merged = new WeakMap<object, Comfort>();

function normalise(raw: unknown): Comfort {
  if (!raw || typeof raw !== "object") return DEFAULT;
  const hit = merged.get(raw as object);
  if (hit) return hit;
  const result = { ...DEFAULT, ...(raw as Partial<Comfort>) };
  merged.set(raw as object, result);
  return result;
}

export function useComfort() {
  const [raw, setRaw] = usePref<Partial<Comfort>>(KEY, DEFAULT);
  const comfort = React.useMemo(() => normalise(raw), [raw]);
  const update = React.useCallback(
    (patch: Partial<Comfort>) => setRaw((prev) => ({ ...DEFAULT, ...(prev ?? {}), ...patch })),
    [setRaw]
  );
  return { comfort, update };
}

/** First light and last light today for a latitude and longitude (NOAA's approximation). */
export function sunTimes(lat: number, lon: number, date = new Date()) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  const gamma = ((2 * Math.PI) / 365) * (day - 1 + (date.getHours() - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const cosHa =
    Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) -
    Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return null; // Polar day or night.
  const ha = Math.acos(cosHa) / rad;
  const tz = -date.getTimezoneOffset();
  const sunrise = 720 - 4 * (lon + ha) - eqTime + tz;
  const sunset = 720 - 4 * (lon - ha) - eqTime + tz;
  return { sunrise, sunset }; // Minutes after local midnight.
}

function deviceLocation(): { lat: number; lon: number } | null {
  try {
    const saved = JSON.parse(localStorage.getItem("weather-device-location") ?? "null") as {
      lat?: number;
      lon?: number;
      latitude?: number;
      longitude?: number;
    } | null;
    const lat = saved?.lat ?? saved?.latitude;
    const lon = saved?.lon ?? saved?.longitude;
    return typeof lat === "number" && typeof lon === "number" ? { lat, lon } : null;
  } catch {
    return null;
  }
}

/** Dark after sunset? Uses the shared location when there is one, else 7:00–19:00. */
export function isAfterSunset(now = new Date()) {
  const here = deviceLocation();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const sun = here ? sunTimes(here.lat, here.lon, now) : null;
  const sunrise = sun?.sunrise ?? 7 * 60;
  const sunset = sun?.sunset ?? 19 * 60;
  return minutes < sunrise || minutes >= sunset;
}

/** Mount once (Providers): big targets on <html>, and the theme following the sun. */
export function ComfortBoot() {
  const { setTheme, theme } = useTheme();
  const themeRef = React.useRef(theme);
  themeRef.current = theme;
  React.useEffect(() => {
    let lastWanted: string | null = null;
    const apply = () => {
      const comfort = normalise(readPref<Partial<Comfort>>(KEY, DEFAULT));
      if (comfort.bigTargets) document.documentElement.dataset.targets = "big";
      else delete document.documentElement.dataset.targets;
      if (!comfort.autoDark) {
        lastWanted = null;
        return;
      }
      const wanted = isAfterSunset() ? "dark" : "light";
      // Paper counts as a light theme the reader chose; only swap when it's time to.
      if (wanted !== lastWanted) {
        lastWanted = wanted;
        const current = themeRef.current;
        if (wanted === "dark" && current !== "dark") setTheme("dark");
        if (wanted === "light" && (current === "dark" || current === "system")) setTheme("light");
      }
    };
    apply();
    const timer = window.setInterval(apply, 60_000);
    const unsubscribe = subscribePref(KEY, apply);
    const onVisible = () => document.visibilityState === "visible" && apply();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [setTheme]);
  return null;
}

const WORD = new RegExp("(\\p{L}[\\p{L}\\p{M}'’-]*)", "u");
const LETTER = new RegExp("^\\p{L}", "u");

/** Bionic reading: the first 40 % (at least one letter) of every word in bold. */
export function bionicHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !parent.closest("pre, code, a, b, strong, h1, h2, h3, h4, mark")) {
      nodes.push(node as Text);
    }
    node = walker.nextNode();
  }
  for (const text of nodes) {
    if (!/\w{2,}/.test(text.data)) continue;
    const fragment = doc.createDocumentFragment();
    const parts = text.data.split(WORD);
    for (const part of parts) {
      if (!part) continue;
      if (LETTER.test(part) && part.length > 1) {
        const bold = Math.max(1, Math.round(part.length * 0.4));
        const b = doc.createElement("b");
        b.className = "bionic";
        b.textContent = part.slice(0, bold);
        fragment.appendChild(b);
        fragment.appendChild(doc.createTextNode(part.slice(bold)));
      } else fragment.appendChild(doc.createTextNode(part));
    }
    text.replaceWith(fragment);
  }
  return doc.body.innerHTML;
}
