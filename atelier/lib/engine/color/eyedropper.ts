import { normalizeHex } from "../model/color";

type EyeDropperCtor = new () => { open(opts?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }> };

const ctor = (): EyeDropperCtor | null => (typeof window === "undefined" ? null : ((window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper ?? null));

/** Whether this browser can sample a colour anywhere on screen (Chromium; not Safari or Firefox). */
export const eyeDropperAvailable = (): boolean => ctor() !== null;

/** Let the owner pick a colour on screen: lower-case `#rrggbb`, or null when cancelled or unavailable. Never throws. */
export async function pickScreenColor(): Promise<string | null> {
  const E = ctor();
  if (!E) return null;
  try {
    const r = await new E().open();
    return normalizeHex(r.sRGBHex);
  } catch {
    return null;
  }
}
