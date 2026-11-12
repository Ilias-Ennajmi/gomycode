// Registry commands for presentation mode and slide order. The Present view and the Slides panel do the work.
import type { Command, CommandCtx } from "../commands/registry";
import { screenToCanvas } from "../geometry/camera";
import { moveSlide, slidesOfDoc, startIndexFor } from "./doc-slides";

const canPresent = (c: CommandCtx) => !!c.ui?.startPresent;

function present(c: CommandCtx, fromSelection: boolean): void {
  const slides = slidesOfDoc(c.doc);
  if (slides.length === 0) {
    c.toast({ message: "Add frames to present." });
    return;
  }
  let index = 0;
  if (fromSelection) {
    const vp = c.canvas.viewport();
    index = startIndexFor(c.doc, slides, c.selection.ids, screenToCanvas(c.canvas.getCamera(), { x: vp.w / 2, y: vp.h / 2 }));
  }
  c.ui?.startPresent?.({ index });
}

/** The one selected slide (a top-level frame), or null. */
function selectedSlide(c: CommandCtx): { id: string; index: number; count: number } | null {
  if (c.selection.size !== 1) return null;
  const slides = slidesOfDoc(c.doc);
  const [id] = [...c.selection.ids];
  const s = slides.find((x) => x.id === id);
  return s ? { id, index: s.index, count: slides.length } : null;
}

export const PRESENT_COMMANDS: Command[] = [
  { id: "present.start", label: "Present", group: "view", shortcut: "Mod+Alt+P", when: canPresent, run: (c) => present(c, false) },
  { id: "present.fromSelection", label: "Present from the selected frame", group: "view", when: canPresent, run: (c) => present(c, true) },
  { id: "present.exit", label: "Exit presentation", group: "view", shortcut: "Escape", when: (c) => !!c.ui?.exitPresent && c.ui.isPresenting?.() === true, run: (c) => c.ui?.exitPresent?.() },
  { id: "frame.setSlideOrder", label: "Slides panel (reorder slides)", group: "board", when: (c) => !!c.ui?.togglePanel, run: (c) => c.ui?.togglePanel?.("slides") },
  {
    id: "frame.slideEarlier",
    label: "Move slide earlier",
    group: "arrange",
    when: (c) => (selectedSlide(c)?.index ?? 0) > 0,
    run: (c) => {
      const s = selectedSlide(c);
      if (s) moveSlide(c.doc, s.id, -1);
    },
  },
  {
    id: "frame.slideLater",
    label: "Move slide later",
    group: "arrange",
    when: (c) => {
      const s = selectedSlide(c);
      return !!s && s.index < s.count - 1;
    },
    run: (c) => {
      const s = selectedSlide(c);
      if (s) moveSlide(c.doc, s.id, 1);
    },
  },
];
