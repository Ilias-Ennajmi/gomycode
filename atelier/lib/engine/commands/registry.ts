import type { CanvasHandle } from "@/components/canvas/CanvasView";
import type { BoardDoc } from "../doc/board-doc";
import type { SelectionStore, ToolId } from "../input/tool-machine";
import type { CanvasObject } from "../model/types";

export type ToastOptions = {
  message: string;
  action?: { label: string; run: () => void };
  /** Default 5000. */
  durationMs?: number;
};

/** Shows a toast. The real one lives in components/chrome/Toast.tsx; commands only depend on this shape. */
export type ToastFn = (o: ToastOptions) => unknown;

/** Things commands cannot do on their own because they belong to the surrounding UI. All optional. */
export type CommandUI = {
  togglePalette(): void;
  openFind(): void;
  /** Open the file picker and add the chosen images at the middle of the view. */
  pickImages(): void;
  toggleSnap(): void;
  /** Open the panel (Layers, Inspector, ...) or close it when it is the one showing. */
  togglePanel(id: string): void;
};

/** Clipboard operations behind the copy/cut/paste commands (wired by useClipboard). */
export type CommandClipboard = {
  copy(): void | Promise<void>;
  cut(): void | Promise<void>;
  paste(): void | Promise<void>;
};

export type CommandCtx = {
  doc: BoardDoc;
  selection: SelectionStore;
  canvas: CanvasHandle;
  setTool(id: ToolId): void;
  toast: ToastFn;
  clipboardStyle: { current: Partial<CanvasObject> | null };
  /** UI hooks (panels, pickers). Commands that need one are unavailable without it. */
  ui?: Partial<CommandUI>;
  clipboard?: CommandClipboard;
  /** Camera moves ease only when this is true (a click, never a keystroke). Default false. */
  animate?: boolean;
};

export type CommandGroup = "edit" | "arrange" | "view" | "insert" | "board";

export type Command = {
  id: string;
  label: string;
  group: CommandGroup;
  /** Primary shortcut, e.g. "Mod+D". Shown in menus and the palette. */
  shortcut?: string;
  /** Further shortcuts that run the same command. */
  altShortcuts?: string[];
  /**
   * The browser performs this one itself (copy, cut, paste fire DOM events): the shortcut is for display only and
   * bindShortcuts must not swallow the key.
   */
  native?: boolean;
  /**
   * Also runs when the key is pressed in a text input of the editor's own panels (the palette and find must open from
   * the Inspector's fields too). Still never inside rich-text editing (contenteditable).
   */
  global?: boolean;
  /** Unavailable (hidden or disabled in menus, ignored by `run`) when this returns false. */
  when?(ctx: CommandCtx): boolean;
  run(ctx: CommandCtx): void;
};

export interface CommandRegistry {
  all(): Command[];
  /** Throws for an unknown id. */
  get(id: string): Command;
  has(id: string): boolean;
  /** Add or replace a command (tools and chrome register theirs here). */
  register(cmd: Command): void;
  /** Runs the command when it exists and is available. Returns whether it ran. */
  run(id: string, ctx: CommandCtx): boolean;
  /** Whether the command exists and is available in `ctx`. */
  available(id: string, ctx: CommandCtx): boolean;
}

export function createRegistry(): CommandRegistry {
  const map = new Map<string, Command>();
  return {
    all: () => [...map.values()],
    get(id) {
      const c = map.get(id);
      if (!c) throw new Error(`Unknown command "${id}"`);
      return c;
    },
    has: (id) => map.has(id),
    register(cmd) {
      map.set(cmd.id, cmd);
    },
    available(id, ctx) {
      const c = map.get(id);
      return !!c && (!c.when || c.when(ctx));
    },
    run(id, ctx) {
      const c = map.get(id);
      if (!c || (c.when && !c.when(ctx))) return false;
      c.run(ctx);
      return true;
    },
  };
}

/** The app-wide registry; commands.ts fills it. */
export const registry: CommandRegistry = createRegistry();
