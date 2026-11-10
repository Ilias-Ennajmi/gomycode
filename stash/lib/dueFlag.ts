"use client";

import { useSyncExternalStore } from "react";

/*
 * "Something is due today" for the Play ring on the bottom bar. Today and Learn
 * write it after they load; the bar reads it from any tab without a query.
 */

const KEY = "stash.due";
const EVENT = "stash:due";

export function setDueFlag(due: boolean): void {
  try {
    const value = due ? new Date().toDateString() : "";
    if (localStorage.getItem(KEY) === value) return;
    localStorage.setItem(KEY, value);
  } catch {
    // best-effort
  }
  window.dispatchEvent(new Event(EVENT));
}

function read(): boolean {
  try {
    // Only counts for the day it was written: tomorrow needs a fresh look.
    return localStorage.getItem(KEY) === new Date().toDateString();
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useDueFlag(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
