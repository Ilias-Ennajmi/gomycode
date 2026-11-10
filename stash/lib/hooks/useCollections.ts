"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import type { SaveItem } from "@/lib/data";
import { arrangeCollections, localCollections, toCollections, type AutoCollection } from "@/lib/collections";

const CACHE = "stash.collections";

function readCache(): AutoCollection[] | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? "null") as AutoCollection[] | null;
    return Array.isArray(c) ? c : null;
  } catch {
    return null;
  }
}

/**
 * The Library's smart groups. The last answer shows at once; `auto_collections()` refreshes
 * it; with neither (first open offline) tags and creators are grouped from the saves on the phone.
 * `stamp` changes when the saves do, so the groups follow new saves.
 */
export function useCollections(saves: SaveItem[], stamp: string): AutoCollection[] {
  const [remote, setRemote] = useState<AutoCollection[] | null>(null);

  useEffect(() => {
    const cached = readCache();
    // localStorage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setRemote((r) => r ?? cached);
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase || !stamp || !navigator.onLine) return;
    let alive = true;
    void supabase.rpc("auto_collections", { p_min: 3 }).then(({ data, error }) => {
      if (!alive || error) return;
      const list = toCollections(data);
      setRemote(list);
      try {
        localStorage.setItem(CACHE, JSON.stringify(list));
      } catch {
        // cache is a convenience only
      }
    });
    return () => {
      alive = false;
    };
  }, [stamp]);

  return useMemo(() => arrangeCollections(remote ?? localCollections(saves)), [remote, saves]);
}
