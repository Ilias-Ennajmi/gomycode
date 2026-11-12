"use client";

import { Eraser, Frame, Hand, Highlighter, Image as ImageIcon, MousePointer2, MoveUpRight, PenLine, Shapes, StickyNote, Type, type LucideIcon } from "lucide-react";
import { createRef, useMemo, useReducer, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { RovingToolbar } from "@/components/ui/RovingToolbar";
import type { ArrowTool, FrameTool, PenTool, ShapeTool, StickyTool } from "@/lib/engine/input/tools";
import type { ToolId } from "@/lib/engine/input/tool-machine";
import { Choice, SwatchGrid, chromeButton } from "./controls";
import { useActiveTool } from "./hooks";
import { FramePresetList, HeadChoice, RouteChoice, ShapeKindChoice, StickyColorPicker, StickySizeChoice, Field } from "./pickers";
import { Popover } from "./Popover";
import { Tip } from "./Tip";

type PopoverKind = "sticky" | "shape" | "arrow" | "pen" | "frame";

type Def = {
  /** Registry command id for the shortcut and the action. */
  command: string;
  tool: ToolId | "image";
  label: string;
  icon: LucideIcon;
  shortcut: string;
  popover?: PopoverKind;
  /** Tools that count as this button being active. */
  covers?: ToolId[];
  /** A creation tool can be locked with a double click. */
  creation?: boolean;
};

const DEFS: Def[] = [
  { command: "tool.select", tool: "select", label: "Select", icon: MousePointer2, shortcut: "V" },
  { command: "tool.hand", tool: "hand", label: "Hand", icon: Hand, shortcut: "H" },
  { command: "tool.sticky", tool: "sticky", label: "Sticky note", icon: StickyNote, shortcut: "N", popover: "sticky", creation: true },
  { command: "tool.text", tool: "text", label: "Text", icon: Type, shortcut: "T", creation: true },
  { command: "tool.shape", tool: "shape", label: "Shapes", icon: Shapes, shortcut: "S", popover: "shape", creation: true },
  { command: "tool.arrow", tool: "arrow", label: "Arrow or line", icon: MoveUpRight, shortcut: "L", popover: "arrow", creation: true },
  { command: "tool.pen", tool: "pen", label: "Pen", icon: PenLine, shortcut: "P", popover: "pen", covers: ["pen", "highlighter", "eraser"], creation: true },
  { command: "tool.frame", tool: "frame", label: "Frame", icon: Frame, shortcut: "F", popover: "frame", creation: true },
  { command: "tool.image", tool: "image", label: "Image", icon: ImageIcon, shortcut: "I" },
];

/** A thin rule between groups of tools. */
const GROUP_STARTS = new Set(["sticky", "image"]);

/**
 * The bottom-centre tool strip: Select V, Hand H, Sticky N, Text T, Shapes S, Arrow/Line L, Pen P (pen, highlighter,
 * eraser E), Frame F, Image I. A roving-tabindex toolbar (arrow keys, Home, End). Pressing a tool selects it and, for a
 * pointer press, opens its options; ArrowUp on a focused tool opens them from the keyboard (keyboard use never
 * animates or pops things open). Double-clicking a creation tool locks it, so it stays active after each use.
 */
export function Toolbar({ insetRight = 0, instant: noMotion = false }: { insetRight?: number; instant?: boolean }) {
  const { handle, run } = useEditor();
  const machine = handle.tools;
  const { id: active, locked } = useActiveTool(machine);
  const [open, setOpen] = useState<PopoverKind | null>(null);
  const [instant, setInstant] = useState(false);
  const anchors = useMemo(() => Object.fromEntries(DEFS.map((d) => [d.tool, createRef<HTMLButtonElement>()])) as Record<string, RefObject<HTMLButtonElement | null>>, []);

  const isActive = (d: Def) => (d.covers ? d.covers.includes(active) : d.tool === active);

  const onClick = (d: Def, e: MouseEvent<HTMLButtonElement>) => {
    if (d.tool === "image") {
      setOpen(null);
      void run(d.command);
      return;
    }
    const wasActive = isActive(d);
    if (!wasActive) machine.setTool(d.tool);
    if (!d.popover) {
      setOpen(null);
      return;
    }
    const byPointer = e.detail > 0;
    setInstant(!byPointer);
    if (!wasActive) setOpen(byPointer ? d.popover : null);
    else if (byPointer) setOpen((cur) => (cur === d.popover ? null : d.popover!));
  };

  const onDoubleClick = (d: Def) => {
    if (!d.creation) return;
    if (!isActive(d)) machine.setTool(d.tool as ToolId);
    machine.setLocked(true);
    setOpen(null);
  };

  const onKeyDown = (d: Def, e: KeyboardEvent<HTMLButtonElement>) => {
    if (d.popover && e.key === "ArrowUp" && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (!isActive(d)) machine.setTool(d.tool as ToolId);
      setInstant(true);
      setOpen(d.popover);
    }
  };

  const penIcon = active === "highlighter" ? Highlighter : active === "eraser" ? Eraser : PenLine;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-[max(var(--space-3),env(safe-area-inset-bottom))] z-(--z-toolbar) flex justify-center px-2 ${noMotion ? "" : "transition-transform duration-(--dur-base) ease-out"}`}
      // Centre the tools in the space the docked panel leaves free.
      style={{ transform: insetRight ? `translateX(${-insetRight / 2}px)` : undefined }}
    >
      <RovingToolbar
        label="Tools"
        className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-panel p-1.5 shadow-2 [scrollbar-width:none]"
      >
        {DEFS.map((d) => {
          const on = d.tool !== "image" && isActive(d);
          const Icon = d.tool === "pen" ? penIcon : d.icon;
          const isLocked = on && locked && d.creation;
          return (
            <span key={d.tool} className="flex items-center gap-0.5">
              {GROUP_STARTS.has(d.tool) ? <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" /> : null}
              <Tip label={isLocked ? `${d.label} (locked)` : d.label} shortcut={d.shortcut}>
                <button
                  ref={anchors[d.tool] as RefObject<HTMLButtonElement>}
                  type="button"
                  aria-label={d.label}
                  aria-keyshortcuts={d.shortcut}
                  aria-pressed={d.tool === "image" ? undefined : on}
                  aria-haspopup={d.popover ? "dialog" : undefined}
                  aria-expanded={d.popover ? open === d.popover : undefined}
                  data-tool={d.tool}
                  data-locked={isLocked ? "true" : undefined}
                  onClick={(e) => onClick(d, e)}
                  onDoubleClick={() => onDoubleClick(d)}
                  onKeyDown={(e) => onKeyDown(d, e)}
                  className={`${chromeButton} relative`}
                >
                  <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
                  {isLocked ? <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-brand" /> : null}
                </button>
              </Tip>
            </span>
          );
        })}
      </RovingToolbar>
      {DEFS.filter((d) => d.popover).map((d) => (
        <Popover
          key={d.popover}
          open={open === d.popover}
          onClose={() => setOpen((cur) => (cur === d.popover ? null : cur))}
          anchor={anchors[d.tool]}
          label={`${POPOVER_TITLE[d.popover!]} options`}
          instant={instant}
          className="p-3"
        >
          <ToolOptions kind={d.popover!} />
        </Popover>
      ))}
    </div>
  );
}

const POPOVER_TITLE: Record<PopoverKind, string> = { sticky: "Sticky", shape: "Shape", arrow: "Arrow", pen: "Pen", frame: "Frame" };

/** The options of the tool, read from and written to the tool object itself (they are not reactive: re-render by hand). */
function ToolOptions({ kind }: { kind: PopoverKind }) {
  const { handle } = useEditor();
  const machine = handle.tools;
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const { id: active } = useActiveTool(machine);
  const set = (fn: () => void) => {
    fn();
    refresh();
  };

  if (kind === "sticky") {
    const t = machine.get<StickyTool>("sticky")!;
    return (
      <div className="flex flex-col gap-3">
        <Field label="Colour">
          <StickyColorPicker value={t.fill} onChange={(v) => set(() => (t.fill = v))} />
        </Field>
        <Field label="Size">
          <StickySizeChoice value={t.size} onChange={(v) => set(() => (t.size = v))} />
        </Field>
      </div>
    );
  }
  if (kind === "shape") {
    const t = machine.get<ShapeTool>("shape")!;
    return <ShapeKindChoice value={t.kind} onChange={(v) => set(() => (t.kind = v))} />;
  }
  if (kind === "arrow") {
    const t = machine.get<ArrowTool>("arrow")!;
    return (
      <div className="flex flex-col gap-3">
        <Field label="Type">
          <Choice
            label="Type"
            value={t.variant}
            onChange={(v) => set(() => t.setVariant(v))}
            options={[
              { value: "arrow", label: "Arrow", text: "Arrow" },
              { value: "line", label: "Line", text: "Line" },
            ]}
          />
        </Field>
        <Field label="Route">
          <RouteChoice value={t.route} onChange={(v) => set(() => (t.route = v))} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Start">
            <HeadChoice label="Start" value={t.startHead} onChange={(v) => set(() => (t.startHead = v))} />
          </Field>
          <Field label="End">
            <HeadChoice label="End" value={t.endHead} onChange={(v) => set(() => (t.endHead = v))} />
          </Field>
        </div>
      </div>
    );
  }
  if (kind === "pen") {
    const which = active === "highlighter" || active === "eraser" ? active : "pen";
    const pen = machine.get<PenTool>(which === "eraser" ? "pen" : which)!;
    const sizes = which === "highlighter" ? ([12, 20, 32] as const) : ([2, 4, 8] as const);
    return (
      <div className="flex flex-col gap-3">
        <Field label="Tool">
          <Choice
            label="Tool"
            value={which}
            onChange={(v) => machine.setTool(v)}
            options={[
              { value: "pen", label: "Pen", icon: PenLine, text: "Pen" },
              { value: "highlighter", label: "Highlighter", icon: Highlighter, text: "Highlighter" },
              { value: "eraser", label: "Eraser", icon: Eraser, text: "Eraser" },
            ]}
          />
        </Field>
        {which !== "eraser" ? (
          <>
            <Field label="Colour">
              <SwatchGrid label="Colour" value={pen.color} onChange={(v) => v && set(() => (pen.color = v))} />
            </Field>
            <Field label="Size">
              <Choice
                label="Size"
                value={String(pen.size)}
                onChange={(v) => set(() => (pen.size = Number(v)))}
                options={sizes.map((s, i) => ({ value: String(s), label: ["Thin", "Medium", "Thick"][i], text: ["Thin", "Medium", "Thick"][i] }))}
              />
            </Field>
          </>
        ) : null}
      </div>
    );
  }
  const t = machine.get<FrameTool>("frame")!;
  return <FramePresetList value={t.preset} onChange={(v) => set(() => (t.preset = v))} />;
}
