"use client";

import { Link2, Link2Off } from "lucide-react";
import { useMemo, useState } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { selectedRoots } from "@/lib/engine/commands/commands";
import { boundsOf, unionRects } from "@/lib/engine/geometry/rect";
import { applyTransform, beginSession, translation, type Transform } from "@/lib/engine/input/transform-ops";
import { oneStepOn } from "@/lib/engine/model/one-step";
import type { CanvasObject, Point } from "@/lib/engine/model/types";
import { useDocTick, useSelectionIds } from "./doc-hooks";
import { descendantIds, typeLabel } from "./layers-model";
import { NumberField } from "./NumberField";

const DEG = 180 / Math.PI;
const ROTATABLE = new Set(["image", "text", "sticky", "shape", "frame", "stroke"]);

const same = (values: number[]): number | null => {
  const first = values[0];
  return values.every((v) => Math.abs(v - first) < 1e-6) ? first : null;
};

/** Position, size, rotation and opacity of the selection as numbers. */
export function InspectorPanel() {
  const { handle } = useEditor();
  const { doc, selection } = handle;
  const ids = useSelectionIds(selection);
  // Re-read whenever something that is selected changes (a drag on the canvas updates the fields live).
  const tick = useDocTick(doc, (changed) => {
    for (const id of changed) if (selection.has(id)) return true;
    return false;
  });
  const [lockOverride, setLockOverride] = useState<boolean | null>(null);

  const roots = useMemo(() => {
    void tick;
    return selectedRoots(doc, ids, true);
  }, [doc, ids, tick]);
  const editable = useMemo(() => roots.filter((o) => !o.locked), [roots]);

  if (roots.length === 0) {
    return <p className="px-4 py-6 text-(length:--text-sm) text-fg-muted">Select something to see its properties.</p>;
  }

  const boxOf = (rs: CanvasObject[]) =>
    rs.length === 1 && rs[0].type !== "group" ? { x: rs[0].x, y: rs[0].y, w: rs[0].w, h: rs[0].h } : unionRects(rs.map(boundsOf))!;
  const box = boxOf(roots);
  const rotatable = roots.every((o) => ROTATABLE.has(o.type));
  const rotation = rotatable ? same(roots.map((o) => o.rotation)) : null;
  const leaves = (o: CanvasObject): CanvasObject[] =>
    o.type === "group" ? descendantIds(doc, o.id).map((id) => doc.get(id)!).filter((c) => c && c.type !== "group") : [o];
  const opacityTargets = editable.flatMap(leaves);
  const opacity = opacityTargets.length ? same(opacityTargets.map((o) => o.opacity)) : null;
  const disabled = editable.length === 0;
  const autoLock = roots.length === 1 && (roots[0].type === "image" || roots[0].type === "sticky");
  const locked = lockOverride ?? autoLock;

  const edit = (merge: boolean, fn: () => void) => (merge ? doc.transact(fn) : oneStepOn(doc, fn));
  const ids2 = editable.map((o) => o.id);

  // Handlers read the document at commit time, not the last render: two quick edits must not use stale numbers.
  const liveBox = () => boxOf(selectedRoots(doc, selection.ids, true));

  const moveTo = (axis: "x" | "y") => (v: number, merge: boolean) => {
    const d = v - liveBox()[axis];
    if (Math.abs(d) < 1e-9) return;
    edit(merge, () => applyTransform(doc, beginSession(doc, ids2, true), translation(axis === "x" ? d : 0, axis === "y" ? d : 0)));
  };

  const resize = (axis: "w" | "h") => (raw: number, merge: boolean) => {
    const cur = liveBox();
    const v = Math.max(1, raw);
    const s = cur[axis] > 0 ? v / cur[axis] : 1;
    const sx = axis === "w" ? s : locked ? s : 1;
    const sy = axis === "h" ? s : locked ? s : 1;
    const tr: Transform = {
      map: (p: Point) => ({ x: cur.x + (p.x - cur.x) * sx, y: cur.y + (p.y - cur.y) * sy }),
      sx,
      sy,
      dRot: 0,
    };
    edit(merge, () => {
      applyTransform(doc, beginSession(doc, ids2, false), tr);
      // One object: write the exact numbers (the scale factor alone leaves float noise such as 200.99999999999997).
      if (ids2.length === 1) {
        const o = doc.get(ids2[0]);
        if (o && o.type !== "group" && o.type !== "arrow" && o.type !== "stroke") {
          const patch: Partial<CanvasObject> = {};
          if (axis === "w" || locked) patch.w = axis === "w" ? v : Math.max(1, Math.round(cur.w * sx * 1e6) / 1e6);
          if (axis === "h" || locked) patch.h = axis === "h" ? v : Math.max(1, Math.round(cur.h * sy * 1e6) / 1e6);
          doc.update(o.id, patch);
        }
      }
    });
  };

  const setRotation = (deg: number, merge: boolean) =>
    edit(merge, () => editable.forEach((o) => doc.update(o.id, { rotation: deg / DEG })));
  const setOpacity = (pct: number, merge: boolean) =>
    edit(merge, () => opacityTargets.forEach((o) => doc.update(o.id, { opacity: Math.min(1, Math.max(0, pct / 100)) })));

  const title = roots.length === 1 ? typeLabel(roots[0]) : `${roots.length} objects`;

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <p className="text-(length:--text-sm) font-medium text-fg">{title}</p>
      {roots.every((o) => o.locked) ? <p className="text-(length:--text-xs) text-fg-muted">Locked. Unlock it to change these values.</p> : null}
      <div className="grid gap-2">
        <NumberField label="X" value={box.x} unit="px" disabled={disabled} onCommit={moveTo("x")} />
        <NumberField label="Y" value={box.y} unit="px" disabled={disabled} onCommit={moveTo("y")} />
        <NumberField label="W" value={box.w} unit="px" min={1} disabled={disabled} onCommit={resize("w")} />
        <NumberField label="H" value={box.h} unit="px" min={1} disabled={disabled} onCommit={resize("h")} />
      </div>
      <button
        type="button"
        aria-pressed={locked}
        disabled={disabled}
        onClick={() => setLockOverride(!locked)}
        className="inline-flex min-h-(--target-min) w-fit items-center gap-2 rounded-sm border border-line px-2 text-(length:--text-sm) text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:opacity-60 aria-pressed:bg-(--color-selection-fill) hoverable:border-fg-muted"
      >
        {locked ? <Link2 aria-hidden="true" size={16} /> : <Link2Off aria-hidden="true" size={16} />}
        <span>Lock aspect ratio</span>
      </button>
      <div className="grid gap-2 border-t border-line pt-3">
        <NumberField
          label="Rotation"
          value={rotatable ? (rotation === null ? null : Math.round(rotation * DEG * 100) / 100) : 0}
          unit="°"
          disabled={disabled || !rotatable}
          onCommit={setRotation}
        />
        <NumberField label="Opacity" value={opacity === null ? null : Math.round(opacity * 100)} unit="%" min={0} max={100} disabled={disabled} onCommit={setOpacity} />
      </div>
    </div>
  );
}
