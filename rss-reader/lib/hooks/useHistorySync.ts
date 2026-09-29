"use client";

import * as React from "react";
import type { MobilePane, ViewState } from "@/lib/hooks/useReaderState";

// Browser history for an app that keeps its navigation in React state, so the Android
// back gesture (and the browser's back button) closes what's open instead of leaving.
//
// Two levels sit on top of the view the app opened on:
//   1. another tab or view (switching again replaces it, so back returns to the start);
//   2. an overlay: an open article, or the sidebar/settings pane on phones.
// Dialogs add their own entry with useBackToClose.
//
// Next.js keeps its own data in history.state (__NA and the router tree) and reloads the
// page when going back to an entry without it, so every entry we write carries it along.

export interface NavSnapshot {
  view: ViewState;
  articleId: string | null;
  pane: MobilePane;
}

function hasOverlay(s: NavSnapshot) {
  return s.pane === "sidebar" || s.pane === "settings" || (s.pane === "reader" && !!s.articleId);
}

function sameView(a: ViewState, b: ViewState) {
  return a.type === b.type && a.id === b.id;
}

function navKey(s: NavSnapshot) {
  return `${s.view.type}:${s.view.id ?? ""}|${hasOverlay(s) ? `${s.pane}:${s.articleId ?? ""}` : ""}`;
}

function currentNav(): NavSnapshot | undefined {
  return window.history.state?.nav;
}

/** The same view with nothing open on top: the entry below an overlay. */
function underneath(s: NavSnapshot): NavSnapshot {
  return { view: s.view, articleId: null, pane: "list" };
}

function entry(nav: NavSnapshot | undefined, dialog = false) {
  return { ...window.history.state, nav, dialog };
}

// A step back is on its way (history.back/go are async). State changes made meanwhile
// wait for it, or they'd be pushed on top of the entry that's about to be left.
let stepping = false;
let waiting: NavSnapshot | null = null;

function stepBack(by = 1) {
  stepping = true;
  window.history.go(-by);
}

export function useHistorySync(
  snapshot: NavSnapshot,
  apply: (snapshot: NavSnapshot) => void,
  ready: boolean
) {
  const base = React.useRef<ViewState | null>(null);
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  const applyRef = React.useRef(apply);
  applyRef.current = apply;
  // Set while React catches up with an entry we moved to, so it isn't pushed again.
  const restoring = React.useRef<string | null>(null);

  const sync = React.useCallback((target: NavSnapshot) => {
    const current = currentNav();
    if (current && navKey(current) === navKey(target)) return;
    if (!current) {
      window.history.replaceState(entry(target), "");
      return;
    }
    const depth = (s: NavSnapshot) =>
      (base.current && !sameView(s.view, base.current) ? 1 : 0) + (hasOverlay(s) ? 1 : 0);
    const diff = depth(target) - depth(current);
    // Two levels at once (e.g. saving a link opens it in Later): back steps through both.
    if (diff > 1) window.history.pushState(entry(underneath(target)), "");
    if (diff > 0) window.history.pushState(entry(target), "");
    else if (diff === 0) window.history.replaceState(entry(target), "");
    else {
      waiting = target;
      stepBack(-diff);
    }
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    if (!base.current) {
      base.current = snapshot.view;
      // Opened straight into an article (a shared link, "Read now"): back shows its list.
      if (hasOverlay(snapshot)) {
        window.history.replaceState(entry(underneath(snapshot)), "");
        window.history.pushState(entry(snapshot), "");
      } else {
        window.history.replaceState(entry(snapshot), "");
      }
      return;
    }
    if (restoring.current === navKey(snapshot)) {
      restoring.current = null;
      return;
    }
    if (stepping) {
      waiting = snapshot;
      return;
    }
    sync(snapshot);
  }, [snapshot, ready, sync]);

  React.useEffect(() => {
    function onPopState(event: PopStateEvent) {
      if (stepping) {
        stepping = false;
        const target = waiting;
        waiting = null;
        if (target) sync(target);
        return;
      }
      const nav: NavSnapshot | undefined = event.state?.nav;
      if (!nav || navKey(nav) === navKey(latest.current)) return;
      restoring.current = navKey(nav);
      applyRef.current(nav);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [sync]);
}

/**
 * Lets back close a dialog. Opening it adds a history entry; closing it from the UI
 * steps back over that entry so the next back press isn't wasted.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const pushed = React.useRef(false);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (open && !pushed.current) {
      pushed.current = true;
      window.history.pushState(entry(currentNav(), true), "");
    } else if (!open && pushed.current) {
      pushed.current = false;
      if (window.history.state?.dialog) stepBack();
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onPopState() {
      if (!pushed.current || window.history.state?.dialog) return;
      pushed.current = false;
      onCloseRef.current();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);
}
