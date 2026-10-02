// Mirrors Appearance to the stash.settings row so choices follow the owner to a
// new phone. Network second: failures are silent, localStorage stays the truth.
import { type Appearance, normalize } from "./appearance";
import { getBrowserClient } from "@/lib/supabase/client";

export async function pullSettings(): Promise<Appearance | null> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("settings")
    .select("theme, accent, accent_custom, text_scale, density, reduce_motion, haptics, updated_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!data) return null;
  return normalize({
    theme: data.theme,
    accent: data.accent,
    accentCustom: data.accent_custom,
    textScale: Number(data.text_scale),
    density: data.density,
    reduceMotion: data.reduce_motion,
    haptics: data.haptics,
    updatedAt: Date.parse(data.updated_at),
  });
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
