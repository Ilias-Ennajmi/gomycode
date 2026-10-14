"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  type Appearance,
  DEFAULT_APPEARANCE,
  applyAppearance,
  normalize,
  readStored,
  writeStored,
} from "@/lib/theme/appearance";
import { pullSettings, pushSettings } from "@/lib/theme/sync";

type Ctx = {
  appearance: Appearance;
  /** Optimistic: restyles instantly, persists locally, then syncs to Supabase. */
  update: (patch: Partial<Appearance>) => void;
};

const AppearanceContext = createContext<Ctx>({ appearance: DEFAULT_APPEARANCE, update: () => {} });

export function useAppearance() {
  return useContext(AppearanceContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt what the pre-paint script already applied, then reconcile with Supabase.
  useEffect(() => {
    const local = readStored();
    // Reading localStorage can only happen after mount; this syncs React state to it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppearance(local);
    applyAppearance(local);
    let cancelled = false;
    pullSettings().then((remote) => {
      if (cancelled || !remote) return;
      setAppearance((prev) => {
        // A device that has never changed its appearance (a new phone) adopts the
        // saved row. Otherwise this device's choice wins and is pushed up, so a
        // change made while the pull was in flight is never overwritten.
        if (prev.updatedAt === 0) {
          writeStored(remote);
          applyAppearance(remote);
          return remote;
        }
        void pushSettings(prev);
        return prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow the OS when the preference is "system".
  useEffect(() => {
    if (appearance.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(appearance);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appearance]);

  const update = useCallback((patch: Partial<Appearance>) => {
    setAppearance((prev) => {
      const next = normalize({ ...prev, ...patch, updatedAt: Date.now() });
      applyAppearance(next);
      writeStored(next);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => void pushSettings(next), 600);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ appearance, update }), [appearance, update]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
