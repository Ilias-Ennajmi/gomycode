"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AssetUploader } from "@/lib/assets/upload-queue";
import { toast as defaultToast } from "@/components/chrome/Toast";
import { useClipboard, type ClipboardApi } from "@/components/canvas/useClipboard";
import { useDropFiles } from "@/components/canvas/useDropFiles";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { registry as defaultRegistry, type CommandCtx, type CommandRegistry, type CommandUI, type ToastFn } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { bindShortcuts } from "@/lib/engine/commands/shortcuts";
import { replaceImageWithFile } from "@/lib/engine/commands/image-commands";
import { screenToCanvas } from "@/lib/engine/geometry/camera";
import type { CanvasObject, Point } from "@/lib/engine/model/types";

/** Ids of right-hand panels. The built-in ones are "layers", "inspector" and "find"; later phases add more. */
export type PanelId = string;

export const PANEL_MIN_WIDTH = 260;
export const PANEL_MAX_WIDTH = 420;
export const PANEL_DEFAULT_WIDTH = 320;
const WIDTH_KEY = "atelier-panel-width";

export type PanelState = {
  /** The one open panel, or null. */
  openId: PanelId | null;
  /** Desktop width in px, 260..420. */
  width: number;
  /** True when the panel was opened from the keyboard: it appears without animating. */
  instant: boolean;
  open(id: PanelId): void;
  close(): void;
  toggle(id: PanelId): void;
  setWidth(px: number): void;
};

export type HiddenState = {
  /** Layers hidden in the editor. Not saved in the board: a hidden layer is back after a reload, and in exports. */
  ids: ReadonlySet<string>;
  set(ids: Iterable<string>, hidden: boolean): void;
};

export type EditorContextValue = {
  handle: CanvasHandle;
  registry: CommandRegistry;
  toast: ToastFn;
  panels: PanelState;
  palette: { open: boolean; setOpen(open: boolean): void; toggle(): void };
  hidden: HiddenState;
  /** Copy, cut, paste and drop of the board (see useClipboard). */
  clipboard: ClipboardApi;
  /** Open another page, e.g. a board from the palette. Defaults to a full page navigation. */
  navigate(href: string): void;
  /** A command context for the current state. Keyboard and palette callers leave `animate` off. */
  commandCtx(opts?: { animate?: boolean }): CommandCtx;
  /** Run a registry command; returns whether it ran. */
  run(id: string, opts?: { animate?: boolean }): boolean;
};

const Ctx = createContext<EditorContextValue | null>(null);

/** The editor state for components inside <EditorProvider>. Throws outside it. */
export function useEditor(): EditorContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditor must be used inside <EditorProvider>");
  return v;
}

export function useOptionalEditor(): EditorContextValue | null {
  return useContext(Ctx);
}

function readWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(n) && n >= PANEL_MIN_WIDTH ? Math.min(n, PANEL_MAX_WIDTH) : PANEL_DEFAULT_WIDTH;
  } catch {
    return PANEL_DEFAULT_WIDTH;
  }
}

export type EditorProviderProps = {
  handle: CanvasHandle;
  /** Adds images from paste, drop and the image picker. Without it image files are refused. */
  uploader?: Pick<AssetUploader, "add"> & Partial<Pick<AssetUploader, "addAssetOnly">>;
  /** Pixel sizes of assets, for the crop maths (the asset resolver). */
  assets?: CommandCtx["assets"];
  registry?: CommandRegistry;
  toast?: ToastFn;
  /** Flips the snapping setting (the board page owns the settings state). */
  onToggleSnap?: () => void;
  navigate?: (href: string) => void;
  /** Where keyboard shortcuts are bound. Default: document.body. */
  shortcutTarget?: HTMLElement | null;
  children?: ReactNode;
};

/**
 * Shares the canvas handle, the command registry, toasts, the open panel, the palette and clipboard wiring with the
 * editor's components, and binds the keyboard shortcuts, copy/cut/paste and file drops while mounted.
 */
export function EditorProvider({
  handle,
  uploader,
  assets,
  registry = defaultRegistry,
  toast = defaultToast,
  onToggleSnap,
  navigate,
  shortcutTarget,
  children,
}: EditorProviderProps) {
  // ---- panels ----
  const [openId, setOpenId] = useState<PanelId | null>(null);
  const [instant, setInstant] = useState(false);
  // Read once on the client. The provider mounts after the canvas does and a panel is never part of the server render.
  const [width, setWidthState] = useState(readWidth);
  const modality = useRef<"keyboard" | "pointer">("pointer");

  useEffect(() => {
    const k = () => {
      modality.current = "keyboard";
    };
    const p = () => {
      modality.current = "pointer";
    };
    window.addEventListener("keydown", k, true);
    window.addEventListener("pointerdown", p, true);
    return () => {
      window.removeEventListener("keydown", k, true);
      window.removeEventListener("pointerdown", p, true);
    };
  }, []);

  const panels = useMemo<PanelState>(
    () => ({
      openId,
      width,
      instant,
      open(id) {
        setInstant(modality.current === "keyboard");
        setOpenId(id);
      },
      close() {
        setOpenId(null);
      },
      toggle(id) {
        setInstant(modality.current === "keyboard");
        setOpenId((cur) => (cur === id ? null : id));
      },
      setWidth(px) {
        const w = Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, px)));
        setWidthState(w);
        try {
          localStorage.setItem(WIDTH_KEY, String(w));
        } catch {
          /* not remembered */
        }
      },
    }),
    [openId, width, instant],
  );

  // ---- palette ----
  const [paletteOpen, setPaletteOpen] = useState(false);
  const palette = useMemo(
    () => ({ open: paletteOpen, setOpen: setPaletteOpen, toggle: () => setPaletteOpen((o) => !o) }),
    [paletteOpen],
  );

  // ---- layers hidden in the editor ----
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const hidden = useMemo<HiddenState>(
    () => ({
      ids: hiddenIds,
      set(ids, on) {
        setHiddenIds((cur) => {
          const next = new Set(cur);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      },
    }),
    [hiddenIds],
  );

  // ---- command context ----
  const clipboardStyle = useRef<{ current: Partial<CanvasObject> | null }>({ current: null });
  const latest = useRef<{ ui: Partial<CommandUI>; clipboard: ClipboardApi | null }>({ ui: {}, clipboard: null });
  const nav = useRef(navigate);
  useEffect(() => {
    nav.current = navigate;
  });

  const commandCtx = useCallback(
    (opts?: { animate?: boolean }): CommandCtx => ({
      doc: handle.doc,
      selection: handle.selection,
      canvas: handle,
      setTool: (id) => handle.tools.setTool(id),
      toast,
      clipboardStyle: clipboardStyle.current,
      ui: latest.current.ui,
      clipboard: latest.current.clipboard ?? undefined,
      assets,
      animate: opts?.animate ?? false,
    }),
    [handle, toast, assets],
  );

  const clipboard = useClipboard({
    handle,
    ctx: commandCtx,
    addImage: uploader ? (file, at) => uploader.add(file, at) : undefined,
  });
  useDropFiles(handle, clipboard.pasteInput);

  const pickImages = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      const vp = handle.viewport();
      const at: Point = screenToCanvas(handle.getCamera(), { x: vp.w / 2, y: vp.h / 2 });
      clipboard.pasteInput({ files }, at);
    };
    input.click();
  }, [handle, clipboard]);

  const replaceImage = useCallback(
    (id: string) => {
      const add = uploader?.addAssetOnly?.bind(uploader);
      if (!add) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) void replaceImageWithFile(commandCtx(), id, file, { addAssetOnly: add });
      };
      input.click();
    },
    [uploader, commandCtx],
  );

  useEffect(() => {
    latest.current = {
      clipboard,
      ui: {
        togglePalette: () => setPaletteOpen((o) => !o),
        openFind: () => {
          setInstant(modality.current === "keyboard");
          setOpenId("find");
        },
        togglePanel: (id) => panels.toggle(id),
        pickImages,
        replaceImage: uploader?.addAssetOnly ? replaceImage : undefined,
        toggleSnap: onToggleSnap,
      },
    };
  });

  useEffect(() => {
    const target = shortcutTarget ?? document.body;
    return bindShortcuts(target, () => commandCtx({ animate: false }), registry);
  }, [shortcutTarget, commandCtx, registry]);

  const run = useCallback((id: string, opts?: { animate?: boolean }) => registry.run(id, commandCtx(opts)), [registry, commandCtx]);

  const value = useMemo<EditorContextValue>(
    () => ({
      handle,
      registry,
      toast,
      panels,
      palette,
      hidden,
      clipboard,
      navigate: (href) => (nav.current ? nav.current(href) : window.location.assign(href)),
      commandCtx,
      run,
    }),
    [handle, registry, toast, panels, palette, hidden, clipboard, commandCtx, run],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <HiddenLayersStyle doc={handle.doc} ids={hiddenIds} />
    </Ctx.Provider>
  );
}

/** Hides the layers the user switched off in the Layers panel (and everything inside them) without touching the board. */
function HiddenLayersStyle({ doc, ids }: { doc: CanvasHandle["doc"]; ids: ReadonlySet<string> }) {
  if (ids.size === 0) return null;
  const all = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (all.has(id)) continue;
    all.add(id);
    for (const c of doc.childrenOf(id)) stack.push(c.id);
  }
  const css = [...all].map((id) => `[data-object-id="${id.replace(/["\\]/g, "")}"]{display:none !important}`).join("\n");
  return <style data-hidden-layers="">{css}</style>;
}
