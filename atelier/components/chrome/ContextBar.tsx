"use client";

import type { Editor } from "@tiptap/core";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Ellipsis,
  Italic,
  Layers,
  Lock,
  LockOpen,
  Minus,
  Plus,
  Strikethrough,
  Underline,
  Blend,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { isEditingSurface } from "@/components/canvas/useCanvasInput";
import { clampFontSize, FONT_SIZES } from "@/components/canvas/rich-text-extensions";
import { useEditor } from "@/components/editor/EditorContext";
import { descendantIds } from "@/components/panels/layers-model";
import { NumberField } from "@/components/panels/NumberField";
import { useSelectionIds } from "@/components/panels/doc-hooks";
import { RovingToolbar } from "@/components/ui/RovingToolbar";
import { boundsOf, unionRects } from "@/lib/engine/geometry/rect";
import { framePresetPx } from "@/lib/engine/model/defaults";
import { oneStepOn } from "@/lib/engine/model/one-step";
import type { ArrowObj, CanvasObject, FrameObj, ImageObj, ShapeObj, StickyObj, StrokeObj, TextObj, VideoObj } from "@/lib/engine/model/types";
import { Choice, ColorChip, SwatchGrid, chromeButton, swatchLabel } from "./controls";
import { useLiveEditor } from "./hooks";
import { MenuList } from "./Menu";
import { arrangeEntries, contextMenuEntries } from "./menu-model";
import { refitText } from "./text-fit";
import { Field, FramePresetList, HeadChoice, RouteChoice, SHAPE_KINDS, ShapeKindChoice, StickyColorPicker, StickySizeChoice, StrokeStyleChoice, StrokeWidthChoice } from "./pickers";
import { Popover } from "./Popover";
import { ImageBarControls } from "./ImageBarControls";
import { LayoutBarControl } from "./LayoutBarControl";
import { SpecimenBarControl } from "./SpecimenBarControl";
import { VideoBarControls } from "./VideoBarControls";
import { LinkBarControls } from "./LinkBarControls";
import { PaletteBarControls, SwatchBarControls } from "./ColorBarControls";
import { placeFloating } from "./place";
import { Tip } from "./Tip";
import { STICKY_COLORS } from "@/lib/engine/model/defaults";

/** Room kept clear above a selection for its rotate handle, and below the top bar / above the toolbar. */
const GAP_TOP = 40;
const GAP_BOTTOM = 12;
const CLEAR_TOP = 64;
const CLEAR_BOTTOM = 72;

type Side = "top" | "bottom";

type Bar = {
  objs: CanvasObject[];
  /** The ones that may be changed (not locked). */
  targets: CanvasObject[];
  patch(make: (o: CanvasObject) => Partial<CanvasObject>, merge?: boolean): void;
  editor: Editor | null;
  withEditor(fn: (ed: Editor) => void): void;
  side: Side;
};

/** The value all `values` share, or undefined when they differ. */
function uniform<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  return values.every((v) => v === first) ? first : undefined;
}

const leavesOf = (doc: ReturnType<typeof useEditor>["handle"]["doc"], o: CanvasObject): CanvasObject[] =>
  o.type === "group" ? descendantIds(doc, o.id).map((id) => doc.get(id)!).filter((c) => c && c.type !== "group") : [o];

/**
 * The bar above (or, near the top edge, below) the selection with only the controls that make sense for it: sticky
 * colour and size, shape fill, stroke and kind, text colour, size and alignment, arrow route and heads, frame size and
 * clipping, and always opacity, lock, arrange and More (the context menu's items). Text formatting goes to the live
 * Tiptap editor while a text is being edited; on a selected, not-yet-edited object it first opens the editor.
 */
export function ContextBar() {
  const { handle } = useEditor();
  const { doc, selection } = handle;
  const ids = useSelectionIds(selection);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  // Re-render at once when a selected object changes (a lock, a colour, a drag).
  useEffect(
    () =>
      doc.onChange((changed) => {
        for (const id of changed) {
          if (selection.has(id)) {
            bump();
            return;
          }
        }
      }),
    [doc, selection],
  );

  const objs = [...ids].flatMap((id) => {
    const o = doc.get(id);
    return o ? [o] : [];
  });
  if (objs.length === 0) return null;
  return <BarView objs={objs} />;
}

function BarView({ objs }: { objs: CanvasObject[] }) {
  const { handle, run, registry, commandCtx } = useEditor();
  const { doc, selection, editing } = handle;
  const editor = useLiveEditor(editing);
  const root = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side>("top");
  const targets = objs.filter((o) => !o.locked);
  const allLocked = targets.length === 0;

  const patch = useCallback<Bar["patch"]>(
    (make, merge = false) => {
      const apply = () => {
        for (const o of targets) doc.update(o.id, make(o));
      };
      if (merge) doc.transact(apply);
      else oneStepOn(doc, apply);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, objs],
  );

  const single = objs.length === 1 ? objs[0] : null;
  const withEditor = useCallback<Bar["withEditor"]>(
    (fn) => {
      const live = editing.editor;
      if (live && !live.isDestroyed) {
        fn(live);
        return;
      }
      const id = single?.id;
      if (!id || !doc.content(id)) return;
      editing.start(id, { selectAll: true });
      const off = editing.subscribe(() => {
        const ed = editing.editor;
        if (!ed) return;
        off();
        clearTimeout(timer);
        queueMicrotask(() => fn(ed));
      });
      const timer = setTimeout(off, 1500); // the editor never came (the object cannot be edited): stop waiting
    },
    [editing, single, doc],
  );

  // ---- position: above the selection (below when it is near the top), following camera and edits -----------------
  const place = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const live = [...selection.ids].flatMap((id) => (doc.get(id) ? [doc.get(id)!] : []));
    const box = unionRects(live.map(boundsOf));
    if (!box) return;
    const cam = handle.getCamera();
    const r = handle.container().getBoundingClientRect();
    const anchor = { left: r.left + (box.x - cam.x) * cam.z, top: r.top + (box.y - cam.y) * cam.z, width: box.w * cam.z, height: box.h * cam.z };
    const offscreen = r.width > 0 && r.height > 0 && (anchor.left > r.right || anchor.left + anchor.width < r.left || anchor.top > r.bottom || anchor.top + anchor.height < r.top);
    el.style.visibility = offscreen ? "hidden" : "visible";
    const vv = window.visualViewport;
    const p = placeFloating(
      anchor,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: vv?.width || window.innerWidth, height: vv?.height || window.innerHeight },
      { prefer: "top", gapTop: GAP_TOP, gapBottom: GAP_BOTTOM, marginTop: CLEAR_TOP, marginBottom: CLEAR_BOTTOM },
    );
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    el.dataset.placement = p.placement;
    setSide((cur) => (cur === p.placement ? cur : p.placement));
  }, [handle, doc, selection]);

  useLayoutEffect(() => {
    place();
  });

  useEffect(() => {
    const off = handle.subscribeCamera(() => place());
    const offDoc = doc.onChange((changed) => {
      for (const id of changed) if (selection.has(id)) return place();
    });
    const ro = typeof ResizeObserver !== "undefined" && root.current ? new ResizeObserver(() => place()) : null;
    if (root.current) ro?.observe(root.current);
    window.addEventListener("resize", place);
    return () => {
      off();
      offDoc();
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [handle, doc, selection, place]);

  // While a drag on the canvas is going on the bar steps aside (it would trail the object and flicker).
  useEffect(() => {
    const el = handle.container();
    const set = (hidden: boolean) => {
      const bar = root.current;
      if (!bar) return;
      bar.style.opacity = hidden ? "0" : "";
      bar.style.pointerEvents = hidden ? "none" : "";
    };
    const down = (e: PointerEvent) => {
      if (!isEditingSurface(e.target)) set(true);
    };
    const up = () => set(false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [handle]);

  const bar: Bar = { objs, targets, patch, editor, withEditor, side };
  const types = new Set(objs.map((o) => o.type));
  const only = types.size === 1 ? objs[0].type : null;
  const textish = single && (single.type === "text" || single.type === "sticky" || single.type === "shape");
  const editingText = editing.id !== null && objs.some((o) => o.id === editing.id) && editor !== null;

  const opacityTargets = targets.flatMap((o) => leavesOf(doc, o));
  const opacity = uniform(opacityTargets.map((o) => o.opacity));
  const lockLabel = allLocked ? "Unlock" : "Lock";

  return (
    <RovingToolbar
      label="Selection"
      rootRef={root}
      style={{ position: "fixed", left: 0, top: 0, visibility: "hidden" }}
      className="z-(--z-toolbar) flex w-max max-w-[calc(100vw-1rem)] flex-wrap items-center gap-0.5 rounded-lg border border-line bg-panel p-1 shadow-2 transition-opacity duration-(--dur-fast) ease-out"
    >
      {!allLocked && only === "sticky" ? <StickyControls bar={bar} /> : null}
      {!allLocked && only === "shape" ? <ShapeControls bar={bar} /> : null}
      {!allLocked && only === "text" ? <TextControls bar={bar} /> : null}
      {!allLocked && only === "arrow" ? <ArrowControls bar={bar} /> : null}
      {!allLocked && only === "frame" ? <FrameControls bar={bar} /> : null}
      {!allLocked && only === "stroke" ? <StrokeControls bar={bar} /> : null}
      {!allLocked && only === "image" ? <ImageBarControls images={objs as ImageObj[]} side={side} /> : null}
      {!allLocked && single?.type === "typeSpecimen" ? <SpecimenBarControl obj={single} side={side} /> : null}
      {only === "video" ? <VideoBarControls objs={objs as VideoObj[]} locked={allLocked} side={side} /> : null}
      {single && (single.type === "link" || single.type === "embed") ? <LinkBarControls obj={single} side={side} /> : null}
      {single?.type === "swatch" ? <SwatchBarControls obj={single} side={side} /> : null}
      {single?.type === "palette" ? <PaletteBarControls obj={single} side={side} /> : null}
      {!allLocked && textish ? <FormatControls bar={bar} single={single!} editing={editingText} /> : null}
      {!allLocked && only && only !== "group" ? <Sep /> : null}

      {!allLocked ? (
        <BarPopover bar={bar} label="Opacity" face={<Blend aria-hidden="true" size={18} strokeWidth={1.75} />} popoverLabel="Opacity">
          <div className="w-56">
            <NumberField
              label="Opacity"
              value={opacity === undefined ? null : Math.round(opacity * 100)}
              unit="%"
              min={0}
              max={100}
              onCommit={(pct, merge) => patch((o) => (o.type === "group" ? {} : { opacity: Math.min(1, Math.max(0, pct / 100)) }), merge)}
            />
            <input
              type="range"
              aria-label="Opacity slider"
              min={0}
              max={100}
              value={opacity === undefined ? 100 : Math.round(opacity * 100)}
              onChange={(e) => patch((o) => (o.type === "group" ? {} : { opacity: Number(e.target.value) / 100 }), true)}
              className="mt-3 h-6 w-full accent-(--color-selection) pointer-coarse:h-11"
            />
          </div>
        </BarPopover>
      ) : null}
      <Tip label={lockLabel} shortcut="Mod+Shift+L" side={side}>
        <button type="button" aria-label={lockLabel} aria-keyshortcuts="Control+Shift+L" onClick={() => void run("arrange.lock")} className={chromeButton}>
          {allLocked ? <LockOpen aria-hidden="true" size={18} strokeWidth={1.75} /> : <Lock aria-hidden="true" size={18} strokeWidth={1.75} />}
        </button>
      </Tip>
      {!allLocked && objs.length >= 2 ? <LayoutBarControl count={objs.length} side={side} /> : null}
      {!allLocked ? (
        <BarPopover bar={bar} label="Arrange" face={<Layers aria-hidden="true" size={18} strokeWidth={1.75} />} role="menu">
          {(close) => <MenuList entries={arrangeEntries(registry, commandCtx(), (id, o) => void run(id, o))} onRun={close} />}
        </BarPopover>
      ) : null}
      <BarPopover bar={bar} label="More actions" face={<Ellipsis aria-hidden="true" size={18} strokeWidth={1.75} />} role="menu" chevron={false}>
        {(close) => <MenuList entries={contextMenuEntries(registry, commandCtx(), (id, o) => void run(id, o))} onRun={close} />}
      </BarPopover>
    </RovingToolbar>
  );
}

const Sep = () => <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-line" />;

/** A bar button that opens a popover next to it (above the bar, or below when the bar sits under its selection). */
function BarPopover({
  bar,
  label,
  popoverLabel = label,
  face,
  children,
  role = "dialog",
  chevron = true,
}: {
  bar: Bar;
  /** Accessible name of the button (may include the current value). */
  label: string;
  popoverLabel?: string;
  face: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  role?: "dialog" | "menu";
  chevron?: boolean;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Tip label={popoverLabel} side={bar.side}>
        <button
          ref={anchor}
          type="button"
          aria-label={label}
          aria-haspopup={role}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${chromeButton} ${chevron ? "w-auto min-w-9 gap-0.5 px-1.5 pointer-coarse:w-auto pointer-coarse:min-w-11" : ""}`}
        >
          {face}
          {chevron ? <ChevronDown aria-hidden="true" size={12} strokeWidth={2} className="text-fg-muted" /> : null}
        </button>
      </Tip>
      <Popover open={open} onClose={close} anchor={anchor} placement={bar.side} role={role} label={popoverLabel} className={role === "menu" ? "p-1" : "p-3"}>
        {typeof children === "function" ? children(close) : children}
      </Popover>
    </>
  );
}

// ---- sticky -------------------------------------------------------------------------------------------------------

function StickyControls({ bar }: { bar: Bar }) {
  const stickies = bar.objs as StickyObj[];
  const fill = uniform(stickies.map((s) => s.fill));
  const size = uniform(stickies.map((s) => s.size));
  return (
    <>
      <BarPopover
        bar={bar}
        label={`Sticky colour: ${fill ? fill[0].toUpperCase() + fill.slice(1) : "mixed"}`}
        popoverLabel="Sticky colour"
        face={<span aria-hidden="true" style={fill ? { background: `var(${STICKY_COLORS[fill]})` } : undefined} className="inline-block size-5 rounded-sm border border-line" />}
      >
        <StickyColorPicker value={fill ?? null} onChange={(v) => bar.patch(() => ({ fill: v }) as Partial<CanvasObject>)} />
      </BarPopover>
      <BarPopover bar={bar} label={`Sticky size: ${size ?? "mixed"}`} popoverLabel="Sticky size" face={<span className="min-w-5 text-(length:--text-xs) font-semibold">{size ?? "–"}</span>}>
        <StickySizeChoice value={size ?? null} onChange={(v) => bar.patch(() => ({ size: v }) as Partial<CanvasObject>)} />
      </BarPopover>
    </>
  );
}

// ---- shape --------------------------------------------------------------------------------------------------------

/** Colour change: a token swatch is one undo step; a custom colour streams in (a drag in the picker), so it merges. */
const isToken = (v: string | null) => v === null || v.startsWith("var(");

function StrokePanel({ bar, colour, width, style, none, onColour, onWidth, onStyle }: {
  bar: Bar;
  colour: string | null | undefined;
  width: number | undefined;
  style: ShapeObj["strokeStyle"] | undefined;
  none: boolean;
  onColour(v: string | null): void;
  onWidth(v: number): void;
  onStyle(v: ShapeObj["strokeStyle"]): void;
}) {
  void bar;
  return (
    <div className="flex w-64 flex-col gap-3">
      <Field label="Colour">
        <SwatchGrid label="Stroke colour" value={colour} allowNone={none} onChange={onColour} />
      </Field>
      <Field label="Width">
        <StrokeWidthChoice value={width ?? null} onChange={onWidth} />
      </Field>
      <Field label="Style">
        <StrokeStyleChoice value={style ?? null} onChange={onStyle} />
      </Field>
    </div>
  );
}

function ShapeControls({ bar }: { bar: Bar }) {
  const shapes = bar.objs as ShapeObj[];
  const fill = uniform(shapes.map((s) => s.fill));
  const stroke = uniform(shapes.map((s) => s.stroke));
  const kind = uniform(shapes.map((s) => s.kind));
  const KindIcon = SHAPE_KINDS.find((k) => k.value === kind)?.icon ?? SHAPE_KINDS[0].icon;
  return (
    <>
      <BarPopover bar={bar} label={`Fill: ${fill === undefined ? "mixed" : swatchLabel(fill)}`} popoverLabel="Fill" face={<ColorChip value={fill} />}>
        <div className="w-64">
          <SwatchGrid label="Fill colour" value={fill} allowNone onChange={(v) => bar.patch(() => ({ fill: v }) as Partial<CanvasObject>, !isToken(v))} />
        </div>
      </BarPopover>
      <BarPopover bar={bar} label={`Stroke: ${stroke === undefined ? "mixed" : swatchLabel(stroke)}`} popoverLabel="Stroke" face={<ColorChip value={stroke} />}>
        <StrokePanel
          bar={bar}
          colour={stroke}
          width={uniform(shapes.map((s) => s.strokeWidth))}
          style={uniform(shapes.map((s) => s.strokeStyle))}
          none
          onColour={(v) => bar.patch(() => ({ stroke: v }) as Partial<CanvasObject>, !isToken(v))}
          onWidth={(w) => bar.patch(() => ({ strokeWidth: w }) as Partial<CanvasObject>)}
          onStyle={(s) => bar.patch(() => ({ strokeStyle: s }) as Partial<CanvasObject>)}
        />
      </BarPopover>
      <BarPopover bar={bar} label={`Shape kind: ${SHAPE_KINDS.find((k) => k.value === kind)?.label ?? "mixed"}`} popoverLabel="Shape kind" face={<KindIcon aria-hidden="true" size={18} strokeWidth={1.75} />}>
        <ShapeKindChoice value={kind ?? null} onChange={(v) => bar.patch(() => ({ kind: v }) as Partial<CanvasObject>)} />
      </BarPopover>
    </>
  );
}

// ---- text ---------------------------------------------------------------------------------------------------------

function TextControls({ bar }: { bar: Bar }) {
  const { doc } = useEditor().handle;
  const texts = bar.objs as TextObj[];
  const colour = uniform(texts.map((t) => t.color));
  const { editor } = bar;
  const rangeSelected = !!editor && !editor.isDestroyed && !editor.state.selection.empty;
  const markSize = rangeSelected ? Number.parseFloat(String(editor!.getAttributes("textStyle").fontSize ?? "")) : NaN;
  const size = Number.isFinite(markSize) ? markSize : uniform(texts.map((t) => t.fontSize));

  const apply = (px: number) => {
    const next = clampFontSize(px);
    if (rangeSelected) editor!.chain().focus().setFontSize(`${next}px`).run();
    else bar.patch((o) => (o.type === "text" ? refitText(doc, o, { fontSize: next }) : {}));
  };
  const step = (dir: 1 | -1) => {
    const cur = size ?? 24;
    const next = dir > 0 ? FONT_SIZES.find((s) => s > cur) : [...FONT_SIZES].reverse().find((s) => s < cur);
    apply(next ?? (dir > 0 ? 96 : 12));
  };

  return (
    <>
      <BarPopover bar={bar} label={`Text colour: ${colour === undefined ? "mixed" : swatchLabel(colour)}`} popoverLabel="Text colour" face={<ColorChip value={colour} />}>
        <div className="w-64">
          <SwatchGrid label="Text colour" value={colour} onChange={(v) => v && bar.patch(() => ({ color: v }) as Partial<CanvasObject>, !isToken(v))} />
        </div>
      </BarPopover>
      <SizeStepper value={size} onCommit={apply} onStep={step} side={bar.side} />
    </>
  );
}

function SizeStepper({ value, onCommit, onStep, side }: { value: number | undefined; onCommit(px: number): void; onStep(dir: 1 | -1): void; side: Side }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? "" : String(Math.round(value)));
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.trim().replace(",", "."));
    setDraft(null);
    if (Number.isFinite(n) && draft.trim() !== "") onCommit(n);
  };
  return (
    <span role="group" aria-label="Font size" className="flex items-center">
      <Tip label="Smaller text" side={side}>
        <button type="button" aria-label="Decrease font size" onClick={() => onStep(-1)} className={chromeButton}>
          <Minus aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </Tip>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Font size"
        autoComplete="off"
        placeholder={value === undefined ? "–" : undefined}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape" && draft !== null) {
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
          }
        }}
        className="h-8 w-11 rounded-sm border border-line bg-canvas text-center text-(length:--text-sm) tabular-nums pointer-coarse:h-11 pointer-coarse:w-12"
      />
      <Tip label="Larger text" side={side}>
        <button type="button" aria-label="Increase font size" onClick={() => onStep(1)} className={chromeButton}>
          <Plus aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </Tip>
    </span>
  );
}

/** Bold, italic, underline, strikethrough, alignment and line spacing: through the live editor. */
function FormatControls({ bar, single, editing }: { bar: Bar; single: CanvasObject; editing: boolean }) {
  const { doc } = useEditor().handle;
  const { editor } = bar;
  const live = editor && !editor.isDestroyed ? editor : null;
  const mark = (label: string, icon: LucideIcon, name: "bold" | "italic" | "underline" | "strike", cmd: "toggleBold" | "toggleItalic" | "toggleUnderline" | "toggleStrike", key: string) => {
    const Icon = icon;
    const on = !!live && live.isActive(name);
    return (
      <Tip label={label} shortcut={key} side={bar.side}>
        <button
          type="button"
          aria-label={label}
          aria-pressed={on}
          onMouseDown={(e) => e.preventDefault() /* keep the caret and selection in the text */}
          onClick={() =>
            bar.withEditor((ed) => {
              (ed.chain().focus() as unknown as Record<string, () => { run(): boolean }>)[cmd]().run();
            })
          }
          className={chromeButton}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </Tip>
    );
  };
  void editing;

  const textObj = single.type === "text" ? (single as TextObj) : null;
  const alignNow = (live?.getAttributes("paragraph").textAlign as string | undefined) ?? textObj?.align ?? "left";
  const lineNow = (live?.getAttributes("paragraph").lineHeight as number | undefined) ?? textObj?.lineHeight ?? 1.3;

  const setAlign = (v: "left" | "center" | "right") => {
    if (live) live.chain().focus().setTextAlign(v).run();
    else if (textObj) bar.patch(() => ({ align: v }) as Partial<CanvasObject>);
    else bar.withEditor((ed) => void ed.chain().focus().setTextAlign(v).run());
  };
  const setLine = (n: number) => {
    if (live) live.chain().focus().setParagraphLineHeight(n).run();
    else if (textObj) bar.patch((o) => (o.type === "text" ? refitText(doc, o, { lineHeight: n }) : {}));
    else bar.withEditor((ed) => void ed.chain().focus().setParagraphLineHeight(n).run());
  };
  const AlignIcon = alignNow === "center" ? AlignCenter : alignNow === "right" ? AlignRight : AlignLeft;

  return (
    <>
      <Sep />
      {mark("Bold", Bold, "bold", "toggleBold", "Mod+B")}
      {mark("Italic", Italic, "italic", "toggleItalic", "Mod+I")}
      {mark("Underline", Underline, "underline", "toggleUnderline", "Mod+U")}
      {mark("Strikethrough", Strikethrough, "strike", "toggleStrike", "Mod+Shift+X")}
      <BarPopover bar={bar} label={`Align: ${alignNow}`} popoverLabel="Align" face={<AlignIcon aria-hidden="true" size={16} strokeWidth={2} />}>
        <Choice
          label="Alignment"
          value={alignNow as "left" | "center" | "right"}
          onChange={setAlign}
          options={[
            { value: "left", label: "Align left", icon: AlignLeft },
            { value: "center", label: "Align centre", icon: AlignCenter },
            { value: "right", label: "Align right", icon: AlignRight },
          ]}
        />
      </BarPopover>
      <BarPopover bar={bar} label={`Line spacing: ${lineNow}`} popoverLabel="Line spacing" face={<span className="text-(length:--text-xs) font-semibold tabular-nums">{Math.round(lineNow * 100) / 100}</span>}>
        <Choice
          label="Line spacing"
          value={String(Math.round(lineNow * 100) / 100)}
          onChange={(v) => setLine(Number(v))}
          options={["1", "1.15", "1.3", "1.5", "2"].map((v) => ({ value: v, label: `${v} line spacing`, text: v }))}
        />
      </BarPopover>
    </>
  );
}

// ---- arrow --------------------------------------------------------------------------------------------------------

function ArrowControls({ bar }: { bar: Bar }) {
  const arrows = bar.objs as ArrowObj[];
  const colour = uniform(arrows.map((a) => a.stroke));
  const route = uniform(arrows.map((a) => a.route));
  const start = uniform(arrows.map((a) => a.startHead));
  const end = uniform(arrows.map((a) => a.endHead));
  return (
    <>
      <BarPopover bar={bar} label={`Stroke: ${colour === undefined ? "mixed" : swatchLabel(colour)}`} popoverLabel="Stroke" face={<ColorChip value={colour} />}>
        <StrokePanel
          bar={bar}
          colour={colour}
          width={uniform(arrows.map((a) => a.strokeWidth))}
          style={uniform(arrows.map((a) => a.strokeStyle))}
          none={false}
          onColour={(v) => v && bar.patch(() => ({ stroke: v }) as Partial<CanvasObject>, !isToken(v))}
          onWidth={(w) => bar.patch(() => ({ strokeWidth: w }) as Partial<CanvasObject>)}
          onStyle={(s) => bar.patch(() => ({ strokeStyle: s }) as Partial<CanvasObject>)}
        />
      </BarPopover>
      <BarPopover bar={bar} label={`Route: ${route ?? "mixed"}`} popoverLabel="Route" face={<span className="px-0.5 text-(length:--text-xs) font-semibold capitalize">{route ?? "–"}</span>}>
        <RouteChoice value={route ?? null} onChange={(v) => bar.patch(() => ({ route: v }) as Partial<CanvasObject>)} />
      </BarPopover>
      <BarPopover bar={bar} label="Heads" popoverLabel="Heads" face={<span className="px-0.5 text-(length:--text-xs) font-semibold">Heads</span>}>
        <div className="flex flex-col gap-3">
          <Field label="Start">
            <HeadChoice label="Start head" value={start ?? null} onChange={(v) => bar.patch(() => ({ startHead: v }) as Partial<CanvasObject>)} />
          </Field>
          <Field label="End">
            <HeadChoice label="End head" value={end ?? null} onChange={(v) => bar.patch(() => ({ endHead: v }) as Partial<CanvasObject>)} />
          </Field>
        </div>
      </BarPopover>
    </>
  );
}

// ---- frame --------------------------------------------------------------------------------------------------------

function FrameControls({ bar }: { bar: Bar }) {
  const frames = bar.objs as FrameObj[];
  const preset = uniform(frames.map((f) => f.preset));
  const clip = uniform(frames.map((f) => f.clip));
  const background = uniform(frames.map((f) => f.background));
  return (
    <>
      <BarPopover bar={bar} label={`Frame size: ${preset ?? "mixed"}`} popoverLabel="Frame size" face={<span className="px-0.5 text-(length:--text-xs) font-semibold">Size</span>}>
        <FramePresetList
          value={preset ?? null}
          onChange={(id) =>
            bar.patch(() => (id === "custom" ? { preset: id } : { preset: id, ...framePresetPx(id) }) as Partial<CanvasObject>)
          }
        />
      </BarPopover>
      <Tip label="Clip content" side={bar.side}>
        <button
          type="button"
          aria-label="Clip content"
          aria-pressed={clip === true}
          onClick={() => bar.patch(() => ({ clip: clip !== true }) as Partial<CanvasObject>)}
          className={`${chromeButton} w-auto min-w-9 px-2 text-(length:--text-xs) font-semibold pointer-coarse:w-auto pointer-coarse:min-w-11`}
        >
          Clip
        </button>
      </Tip>
      <BarPopover bar={bar} label={`Frame background: ${background === undefined ? "mixed" : swatchLabel(background)}`} popoverLabel="Frame background" face={<ColorChip value={background} />}>
        <div className="w-64">
          <SwatchGrid label="Background colour" value={background} allowNone onChange={(v) => bar.patch(() => ({ background: v }) as Partial<CanvasObject>, !isToken(v))} />
        </div>
      </BarPopover>
    </>
  );
}

// ---- drawing ------------------------------------------------------------------------------------------------------

function StrokeControls({ bar }: { bar: Bar }) {
  const strokes = bar.objs as StrokeObj[];
  const colour = uniform(strokes.map((s) => s.color));
  return (
    <BarPopover bar={bar} label={`Colour: ${colour === undefined ? "mixed" : swatchLabel(colour)}`} popoverLabel="Colour" face={<ColorChip value={colour} />}>
      <div className="w-64">
        <SwatchGrid label="Drawing colour" value={colour} onChange={(v) => v && bar.patch(() => ({ color: v }) as Partial<CanvasObject>, !isToken(v))} />
      </div>
    </BarPopover>
  );
}
