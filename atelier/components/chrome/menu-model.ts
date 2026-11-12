import type { CommandCtx, CommandRegistry } from "@/lib/engine/commands/registry";
import { formatShortcut } from "@/lib/engine/commands/shortcuts";
import type { MenuEntry } from "./Menu";

type Spec = { id: string; label?: (ctx: CommandCtx) => string };

const lockLabel = (ctx: CommandCtx) => {
  const objs = [...ctx.selection.ids].flatMap((id) => (ctx.doc.get(id) ? [ctx.doc.get(id)!] : []));
  return objs.length > 0 && objs.every((o) => o.locked) ? "Unlock" : "Lock";
};

const SECTIONS: Spec[][] = [
  [{ id: "edit.cut" }, { id: "edit.copy" }, { id: "edit.paste" }, { id: "edit.duplicate" }, { id: "edit.delete" }],
  [{ id: "arrange.group" }, { id: "arrange.ungroup" }, { id: "arrange.lock", label: lockLabel }],
  [{ id: "arrange.front" }, { id: "arrange.forward" }, { id: "arrange.backward" }, { id: "arrange.back" }],
  [
    { id: "arrange.align.left" },
    { id: "arrange.align.hcenter" },
    { id: "arrange.align.right" },
    { id: "arrange.align.top" },
    { id: "arrange.align.vcenter" },
    { id: "arrange.align.bottom" },
    { id: "arrange.distribute.x" },
    { id: "arrange.distribute.y" },
  ],
  [{ id: "edit.selectAll" }],
];

/** The order-only subset (the context bar's Arrange popover). */
const ARRANGE: Spec[][] = [
  [{ id: "arrange.front" }, { id: "arrange.forward" }, { id: "arrange.backward" }, { id: "arrange.back" }],
  [{ id: "arrange.group" }, { id: "arrange.ungroup" }],
  SECTIONS[3],
  [{ id: "arrange.flipH" }, { id: "arrange.flipV" }],
];

function build(sections: Spec[][], registry: CommandRegistry, ctx: CommandCtx, run: (id: string, opts: { animate: boolean }) => void): MenuEntry[] {
  const out: MenuEntry[] = [];
  sections.forEach((section, si) => {
    const items: MenuEntry[] = [];
    for (const spec of section) {
      if (!registry.available(spec.id, ctx)) continue;
      const cmd = registry.get(spec.id);
      items.push({
        type: "item",
        id: spec.id,
        label: spec.label ? spec.label(ctx) : cmd.label,
        shortcut: cmd.shortcut ? formatShortcut(cmd.shortcut) : undefined,
        danger: spec.id === "edit.delete",
        run: (o) => run(spec.id, o),
      });
    }
    if (items.length === 0) return;
    if (out.length > 0) out.push({ type: "separator", id: `sep${si}` });
    out.push(...items);
  });
  return out;
}

/** What the context menu and the context bar's More menu list: registry commands that are available right now. */
export function contextMenuEntries(registry: CommandRegistry, ctx: CommandCtx, run: (id: string, opts: { animate: boolean }) => void): MenuEntry[] {
  return build(SECTIONS, registry, ctx, run);
}

export function arrangeEntries(registry: CommandRegistry, ctx: CommandCtx, run: (id: string, opts: { animate: boolean }) => void): MenuEntry[] {
  return build(ARRANGE, registry, ctx, run);
}
