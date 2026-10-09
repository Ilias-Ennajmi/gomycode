"use client";

import { useEffect, useRef } from "react";

/*
 * While an overlay (sheet, dialog, player) is open it owns one history entry,
 * so Android's back gesture closes it instead of leaving the app (playbook
 * step 3.6).
 *
 * One module-level listener and a stack keep this correct when overlays nest
 * (back closes only the top one) and when an overlay closes and reopens
 * quickly: closing by tap calls history.back(), which lands asynchronously, so
 * any push requested meanwhile waits for that popstate first.
 */

type Entry = { marker: string; close: () => void };

const stack: Entry[] = [];
let ignorePops = 0;
const queuedPushes: { marker: string; run: () => void }[] = [];
let listening = false;

function onPopState() {
  if (ignorePops > 0) {
    ignorePops--;
    if (ignorePops === 0) queuedPushes.splice(0).forEach((q) => q.run());
    return;
  }
  const top = stack[stack.length - 1];
  if (top && window.history.state?.stashOverlay !== top.marker) {
    stack.pop();
    top.close();
  }
}

function ensureListener() {
  if (listening) return;
  window.addEventListener("popstate", onPopState);
  listening = true;
}

function push(entry: Entry) {
  const doPush = () => {
    window.history.pushState({ ...window.history.state, stashOverlay: entry.marker }, "");
    stack.push(entry);
  };
  if (ignorePops > 0) queuedPushes.push({ marker: entry.marker, run: doPush });
  else doPush();
}

function release(marker: string) {
  const index = stack.findIndex((e) => e.marker === marker);
  if (index === -1) {
    // Never pushed yet (still queued behind a pending back): drop the request.
    const q = queuedPushes.findIndex((e) => e.marker === marker);
    if (q !== -1) queuedPushes.splice(q, 1);
    return;
  }
  stack.splice(index, 1);
  // Still on our entry (closed by tap/button): step back off it, silently.
  // If the user navigated away instead, the entry stays behind in history.
  if (window.history.state?.stashOverlay === marker) {
    ignorePops++;
    window.history.back();
  }
}

export function useBackToClose(open: boolean, onClose: () => void, key = "overlay") {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    ensureListener();
    const marker = `${key}-${Math.random().toString(36).slice(2)}`;
    push({ marker, close: () => onCloseRef.current() });
    return () => release(marker);
  }, [open, key]);
}
