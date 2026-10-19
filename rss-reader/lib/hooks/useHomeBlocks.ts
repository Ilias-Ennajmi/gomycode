"use client";

import * as React from "react";

// Today is made of blocks; which ones show, and in what order, is up to the reader
// (Today → Customise). Kept on the device.

export const HOME_BLOCKS = [
  { id: "bigPicture", label: "The big picture", briefing: true },
  { id: "continue", label: "Continue where you left off", briefing: false },
  { id: "top", label: "Top stories", briefing: true },
  { id: "numbers", label: "By the numbers", briefing: true },
  { id: "interests", label: "In your interests", briefing: true },
  { id: "watch", label: "Worth watching", briefing: true },
  { id: "reads", label: "Newsletters and a long read", briefing: true },
  { id: "review", label: "Daily review", briefing: false },
  { id: "highlights", label: "From your highlights", briefing: false },
  { id: "tidy", label: "Sources to tidy up", briefing: false },
  { id: "more", label: "More stories", briefing: true },
  { id: "week", label: "Your week", briefing: false },
] as const;

export type HomeBlockId = (typeof HOME_BLOCKS)[number]["id"];

interface Layout {
  order: HomeBlockId[];
  hidden: HomeBlockId[];
}

const KEY = "home-blocks";
const DEFAULT: Layout = { order: HOME_BLOCKS.map((b) => b.id), hidden: [] };
const IDS = new Set<string>(HOME_BLOCKS.map((b) => b.id));

function read(): Layout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const saved = JSON.parse(raw) as Partial<Layout>;
    // Blocks added since the layout was saved go at their default place.
    const order = (saved.order ?? []).filter((id) => IDS.has(id));
    for (const id of DEFAULT.order) if (!order.includes(id)) order.push(id);
    return { order, hidden: (saved.hidden ?? []).filter((id) => IDS.has(id)) };
  } catch {
    return DEFAULT;
  }
}

export function useHomeBlocks() {
  const [layout, setLayout] = React.useState<Layout>(DEFAULT);
  React.useEffect(() => setLayout(read()), []);
  const save = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Fine: the default layout.
    }
  };
  const blocks = layout.order.map((id) => ({
    ...HOME_BLOCKS.find((b) => b.id === id)!,
    on: !layout.hidden.includes(id),
  }));
  return {
    blocks,
    toggle: (id: HomeBlockId) =>
      save({
        ...layout,
        hidden: layout.hidden.includes(id)
          ? layout.hidden.filter((h) => h !== id)
          : [...layout.hidden, id],
      }),
    move: (id: HomeBlockId, direction: -1 | 1) => {
      const index = layout.order.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= layout.order.length) return;
      const order = [...layout.order];
      [order[index], order[target]] = [order[target], order[index]];
      save({ ...layout, order });
    },
    reset: () => save(DEFAULT),
    customised: layout.hidden.length > 0 || layout.order.join() !== DEFAULT.order.join(),
  };
}
