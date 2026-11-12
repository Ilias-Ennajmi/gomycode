import type { Command, CommandCtx } from "./registry";

const sourceTarget = (c: CommandCtx) => {
  if (c.selection.size !== 1) return null;
  const o = c.doc.get([...c.selection.ids][0]);
  return o && (o.type === "image" || o.type === "video") ? o : null;
};

/** Where the Inspector's Source section lives while it is open; used to bring focus to it. */
const SOURCE_SECTION = "[data-source-fields] input";

/** Provenance: the credits overlay switch, and a way into the Source fields of the selected picture or video. */
export const PROVENANCE_COMMANDS: Command[] = [
  {
    id: "view.credits",
    label: "Show credits on the board",
    group: "view",
    // The board's own setting (like the value check): synced to other devices, never an undo step.
    run: (c) => void (c.doc.meta.showCredits = !c.doc.meta.showCredits),
  },
  {
    id: "image.editSource",
    label: "Edit source and credit",
    group: "edit",
    when: (c) => sourceTarget(c) !== null && !!c.ui?.togglePanel,
    run: (c) => {
      const focusIt = () => document.querySelector<HTMLElement>(SOURCE_SECTION)?.focus();
      if (document.querySelector(SOURCE_SECTION)) return focusIt();
      c.ui?.togglePanel?.("inspector");
      // The panel mounts on the next render; the first input of the section takes focus once it is there.
      requestAnimationFrame(() => requestAnimationFrame(focusIt));
    },
  },
];
