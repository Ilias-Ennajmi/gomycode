"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import type { GalaxyCluster, GalaxyPoint } from "@/lib/galaxyMath";

/** The owner's Galaxy as the worker last laid it out (RLS: own rows only). */
export type Galaxy = { points: GalaxyPoint[]; clusters: GalaxyCluster[]; builtAt: string | null };

export const GALAXY_CACHE = "stash.galaxy";

export function readGalaxyCache(): Galaxy | null {
  try {
    const g = JSON.parse(localStorage.getItem(GALAXY_CACHE) ?? "null") as Galaxy | null;
    return g && Array.isArray(g.points) && Array.isArray(g.clusters) ? g : null;
  } catch {
    return null;
  }
}

export async function fetchGalaxy(): Promise<Galaxy> {
  const supabase = getBrowserClient();
  if (!supabase) throw new Error("Supabase isn't configured");
  const [p, c, l] = await Promise.all([
    supabase.from("galaxy_points").select("save_id,x,y,cluster").limit(5000),
    supabase.from("galaxy_clusters").select("cluster,label,cx,cy,size").order("cluster"),
    supabase.from("galaxy_layouts").select("built_at").maybeSingle(),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  const galaxy: Galaxy = {
    points: (p.data ?? []).map((r) => ({ saveId: r.save_id, x: Number(r.x), y: Number(r.y), cluster: r.cluster })),
    clusters: (c.data ?? []).map((r) => ({ cluster: r.cluster, label: r.label, cx: Number(r.cx), cy: Number(r.cy), size: r.size })),
    builtAt: l.data?.built_at ?? null,
  };
  try {
    localStorage.setItem(GALAXY_CACHE, JSON.stringify(galaxy));
  } catch {
    // cache is a convenience only
  }
  return galaxy;
}

/** Calls back when the worker finishes a new layout (Realtime on galaxy_layouts). */
export function onGalaxyChange(listener: () => void): () => void {
  const supabase = getBrowserClient();
  const channel = supabase
    ?.channel(`stash-galaxy-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "stash", table: "galaxy_layouts" }, listener)
    .subscribe();
  return () => {
    if (channel) void supabase?.removeChannel(channel);
  };
}
