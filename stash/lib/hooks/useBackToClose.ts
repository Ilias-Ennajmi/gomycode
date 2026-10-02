"use client";

import { useEffect, useRef } from "react";

/**
 * While `open`, pushes a history entry so Android's back gesture closes the
 * sheet/dialog/player instead of leaving the app (playbook step 3.6).
 * Closing by other means (tap outside, button) pops that entry again.
 */
export function useBackToClose(open: boolean, onClose: () => void, key = "overlay") {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const marker = `${key}-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ ...window.history.state, stashOverlay: marker }, "");
    let poppedByBack = false;
    const onPop = () => {
      poppedByBack = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed without the back gesture: remove our entry so back still works normally.
      if (!poppedByBack && window.history.state?.stashOverlay === marker) window.history.back();
    };
  }, [open, key]);
}
