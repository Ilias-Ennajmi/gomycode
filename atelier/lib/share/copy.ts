// Copy text for the owner: the clipboard API when it works, else select the field and ask the browser to copy, else leave it
// selected so Ctrl+C does it. Never throws.

export type CopyOutcome = "copied" | "select";

export async function copyText(text: string, field: HTMLInputElement | HTMLTextAreaElement | null): Promise<CopyOutcome> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch {
    /* not allowed here (no permission, an insecure origin): fall through to selecting */
  }
  try {
    field?.focus();
    field?.select();
    field?.setSelectionRange?.(0, text.length);
    if (typeof document !== "undefined" && document.execCommand?.("copy")) return "copied";
  } catch {
    /* fall through */
  }
  try {
    field?.select();
    field?.setSelectionRange?.(0, text.length);
  } catch {
    /* nothing more to do */
  }
  return "select";
}
