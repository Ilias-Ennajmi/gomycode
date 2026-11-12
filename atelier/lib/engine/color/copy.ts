import type { ToastFn } from "../commands/registry";

/** Put `text` on the clipboard. Resolves false (never throws) when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Copy a colour value and say so in a (polite) toast; says so too when the browser refuses. */
export async function copyColorValue(value: string, toast: ToastFn): Promise<void> {
  toast({ message: (await copyText(value)) ? `Copied ${value}` : "Couldn't copy. Select the value and copy it by hand." });
}
