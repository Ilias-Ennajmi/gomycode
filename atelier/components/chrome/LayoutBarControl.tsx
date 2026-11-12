"use client";

import { AlignVerticalSpaceAround, Columns3, LayoutGrid, LayoutDashboard, MoveVertical, PackageOpen, Rows3, StretchHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { GutterField } from "@/components/panels/BoardFields";
import { NumberField } from "@/components/panels/NumberField";
import { defaultColumns, layoutTargets, runLayout, type LayoutKind } from "@/lib/engine/commands/layout-commands";
import { boundsOf } from "@/lib/engine/geometry/rect";
import { BarPopoverButton } from "./bar-popover";
import { chromeTextButton } from "./controls";

const ACTIONS: { kind: LayoutKind; label: string; icon: ReactNode }[] = [
  { kind: "grid", label: "Grid", icon: <LayoutGrid aria-hidden="true" size={16} strokeWidth={1.75} /> },
  { kind: "masonry", label: "Masonry", icon: <LayoutDashboard aria-hidden="true" size={16} strokeWidth={1.75} /> },
  { kind: "justified", label: "Justified rows", icon: <Rows3 aria-hidden="true" size={16} strokeWidth={1.75} /> },
  { kind: "pack", label: "Tight pack", icon: <PackageOpen aria-hidden="true" size={16} strokeWidth={1.75} /> },
  { kind: "normaliseHeights", label: "Equal heights", icon: <MoveVertical aria-hidden="true" size={16} strokeWidth={1.75} /> },
  { kind: "normaliseWidths", label: "Equal widths", icon: <StretchHorizontal aria-hidden="true" size={16} strokeWidth={1.75} /> },
  { kind: "tidy", label: "Tidy", icon: <AlignVerticalSpaceAround aria-hidden="true" size={16} strokeWidth={1.75} /> },
];

function LayoutPanel({ count, close }: { count: number; close: () => void }) {
  const { commandCtx, handle } = useEditor();
  const [columns, setColumns] = useState(() => defaultColumns(count));
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const median = () => {
    const hs = layoutTargets(commandCtx()).map((o) => boundsOf(o).h).sort((a, b) => a - b);
    return hs.length ? Math.round(hs[hs.length >> 1]) : 160;
  };
  void handle;
  return (
    <div className="flex w-80 flex-col gap-3">
      <div className="grid gap-2">
        <NumberField label="Columns" value={columns} min={1} max={24} onCommit={(v) => setColumns(Math.max(1, Math.round(v)))} />
        <NumberField label="Row height" value={rowHeight ?? median()} unit="px" min={20} max={2000} onCommit={(v) => setRowHeight(v)} />
      </div>
      <GutterField />
      <div role="group" aria-label="Layouts" className="grid grid-cols-2 gap-1">
        {ACTIONS.map((a) => (
          <button
            key={a.kind}
            type="button"
            onClick={() => {
              // A click: positions glide. Columns and row height only matter to the layouts that use them.
              runLayout(commandCtx({ animate: true }), a.kind, { columns, targetRowHeight: rowHeight ?? undefined });
              close();
            }}
            className={`${chromeTextButton} justify-start whitespace-nowrap border border-line text-(length:--text-sm)`}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The selection bar's "Layout" control for two or more objects: arrange them as a grid, masonry, rows, a tight pack... */
export function LayoutBarControl({ count, side }: { count: number; side: "top" | "bottom" }) {
  return (
    <BarPopoverButton label="Layout" side={side} face={<Columns3 aria-hidden="true" size={18} strokeWidth={1.75} />}>
      {(close) => <LayoutPanel count={count} close={close} />}
    </BarPopoverButton>
  );
}
