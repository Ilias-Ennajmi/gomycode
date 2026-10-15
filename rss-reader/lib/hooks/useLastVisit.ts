"use client";

import * as React from "react";

const PREFIX = "reader-visit:";

function read(key: string) {
  try {
    const value = Number(localStorage.getItem(PREFIX + key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function write(key: string, time: number) {
  try {
    localStorage.setItem(PREFIX + key, String(time));
  } catch {
    // Not remembered: no divider next time.
  }
}

/**
 * When this list was last open (null the first time), kept for the whole visit so a
 * "new since your last visit" line stays put. The time is saved when you leave the list,
 * close the tab or put the app away.
 */
export function useLastVisit(key: string) {
  const [lastVisit, setLastVisit] = React.useState<number | null>(null);
  React.useEffect(() => {
    setLastVisit(read(key));
    const save = () => write(key, Date.now());
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
    });
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [key]);
  return lastVisit;
}
