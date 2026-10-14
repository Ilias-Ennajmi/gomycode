// Mirrors Appearance to the stash.settings row so choices follow the owner to a
// new phone. Network second: failures are silent, localStorage stays the truth.
import { type Appearance, normalize } from "./appearance";
import { pickOnAccent, readToken } from "./contrast";
import { getBrowserClient } from "@/lib/supabase/client";

export async function pullSettings(): Promise<Appearance | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("settings")
    .select("theme, accent, accent_custom, text_scale, density, reduce_motion, haptics")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!data) return null;
  const remote = normalize({
    theme: data.theme,
    accent: data.accent,
    accentCustom: data.accent_custom,
    textScale: Number(data.text_scale),
    density: data.density,
    reduceMotion: data.reduce_motion,
    haptics: data.haptics,
    // Remote rows are only adopted on a device with no local choice yet.
    updatedAt: 1,
  });
  // The ink for a custom accent isn't stored; recompute it for 4.5:1 contrast.
  if (remote.accent === "custom" && remote.accentCustom) {
    remote.onAccentCustom = pickOnAccent(remote.accentCustom, readToken("--ink-dark"), readToken("--ink-light")).ink;
  }
  return remote;
}

export async function pushSettings(a: Appearance): Promise<void> {
  const supabase = getBrowserClient();
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("settings").upsert({
    user_id: auth.user.id,
    theme: a.theme,
    accent: a.accent,
    accent_custom: a.accentCustom,
    text_scale: a.textScale,
    density: a.density,
    reduce_motion: a.reduceMotion,
    haptics: a.haptics,
  });
}
