import { registry as defaultRegistry, type CommandCtx, type CommandRegistry } from "./registry";

type Parsed = { mod: boolean; shift: boolean; alt: boolean; key: string };

const NAMED: Record<string, string> = { del: "Delete", delete: "Delete", backspace: "Backspace", esc: "Escape", escape: "Escape", enter: "Enter", space: " " };

/** KeyboardEvent.code of the keys whose character changes with Shift/Alt or the layout. */
const CODE_OF: Record<string, string> = {
  "=": "Equal",
  "-": "Minus",
  "[": "BracketLeft",
  "]": "BracketRight",
  "0": "Digit0",
  "1": "Digit1",
  "2": "Digit2",
  "3": "Digit3",
  "4": "Digit4",
  "5": "Digit5",
  "6": "Digit6",
  "7": "Digit7",
  "8": "Digit8",
  "9": "Digit9",
};

const cache = new Map<string, Parsed>();

function parse(shortcut: string): Parsed {
  const hit = cache.get(shortcut);
  if (hit) return hit;
  const parts = shortcut.split("+");
  // A trailing "+" is the plus key itself ("Mod++").
  let key = parts.pop() ?? "";
  if (key === "" && shortcut.endsWith("+")) key = "+";
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const parsed: Parsed = {
    mod: mods.has("mod") || mods.has("ctrl") || mods.has("cmd"),
    shift: mods.has("shift"),
    alt: mods.has("alt") || mods.has("option"),
    key: NAMED[key.toLowerCase()] ?? (key.length === 1 ? key.toLowerCase() : key),
  };
  cache.set(shortcut, parsed);
  return parsed;
}

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"> & { code?: string };

/**
 * Does the event press `shortcut` ("Mod+Shift+Z", "V", "Delete")? Mod is Ctrl or Cmd. Modifiers must match exactly.
 * Letters match the typed character (so Dvorak users get Mod+Z where their Z is), except under Alt where the
 * character is mangled (Option+C types a c-cedilla on a Mac) and the physical key decides; digits and
 * punctuation match by physical key as well.
 */
export function matchShortcut(e: KeyLike, shortcut: string): boolean {
  const p = parse(shortcut);
  if ((e.ctrlKey || e.metaKey) !== p.mod || e.shiftKey !== p.shift || e.altKey !== p.alt) return false;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === p.key) return true;
  const code = e.code;
  if (!code) return false;
  if (/^[a-z]$/.test(p.key)) return e.altKey && code === `Key${p.key.toUpperCase()}`;
  const want = CODE_OF[p.key];
  return !!want && code === want;
}

const MAC_SYMBOLS: Record<string, string> = { Mod: "⌘", Shift: "⇧", Alt: "⌥", Delete: "⌦", Backspace: "⌫" };

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? navigator.platform ?? "");
}

/** "Mod+Shift+Z" -> "Ctrl+Shift+Z" or, on a Mac, "⌘⇧Z". */
export function formatShortcut(shortcut: string, mac: boolean = isMacPlatform()): string {
  const parts = shortcut.split("+").filter((s, i, a) => s !== "" || i === a.length - 1);
  if (mac) return parts.map((s) => MAC_SYMBOLS[s] ?? s).join("");
  return parts.map((s) => (s === "Mod" ? "Ctrl" : s)).join("+");
}

/** True for events that come from something the user is typing into: those keys belong to that control. */
export function isRichTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.getAttribute("contenteditable") === "true" || t.getAttribute("contenteditable") === "";
}

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.getAttribute("contenteditable") === "true" || t.getAttribute("contenteditable") === "") return true;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

/**
 * Run registry commands from the keyboard. Keys typed into inputs, textareas, selects and contenteditable are left
 * alone (only commands marked `global`, the palette and find, also run from plain inputs), as are events something
 * else already handled (`defaultPrevented`) and IME composition. Keyboard-triggered
 * commands never animate. Returns the function that removes the listener.
 */
export function bindShortcuts(
  target: HTMLElement,
  ctx: () => CommandCtx,
  registry: CommandRegistry = defaultRegistry,
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    const typing = isTypingTarget(e.target);
    if (typing && isRichTextTarget(e.target)) return;
    const c = { ...ctx(), animate: false };
    for (const cmd of registry.all()) {
      if (typing && !cmd.global) continue; // keys typed into a field belong to the field, except a few app-wide ones
      const keys = cmd.shortcut ? [cmd.shortcut, ...(cmd.altShortcuts ?? [])] : (cmd.altShortcuts ?? []);
      if (!keys.some((k) => matchShortcut(e, k))) continue;
      if (!registry.available(cmd.id, c)) continue; // an unavailable command leaves the key alone (Escape, C, ...)
      if (cmd.native) return; // the browser's own copy/cut/paste event does the work
      e.preventDefault();
      registry.run(cmd.id, c);
      return;
    }
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}
