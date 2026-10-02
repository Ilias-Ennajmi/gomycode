import { readStored } from "@/lib/theme/appearance";

/** 10 ms tick on save, keep, archive, applied, recall grades. Off when the setting is off. */
export function haptic(ms = 10): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (!readStored().haptics) return;
  try {
    navigator.vibrate(ms);
  } catch {
    // Some browsers throw without a user gesture; haptics are best-effort.
  }
}
