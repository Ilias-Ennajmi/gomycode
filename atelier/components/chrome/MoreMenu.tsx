"use client";

import { Ellipsis } from "lucide-react";
import { useRef, useState } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { chromeButton } from "./controls";
import { MenuList, type MenuEntry } from "./Menu";
import { Popover } from "./Popover";
import { Tip } from "./Tip";

/** Insert commands that already have a button of their own on the toolbar. */
const HAS_TOOLBAR_BUTTON = (id: string) => id.startsWith("tool.");

/**
 * The "⋯ More" button at the end of the bottom toolbar: a menu of every registry command in the "insert" group that the
 * toolbar has no button for (link card, embed, type specimen, video, ...). Features add themselves by registering an
 * `insert.*` command; this menu reads the registry each time it opens, and shows only the commands available right now.
 */
export function MoreMenu() {
  const { registry, commandCtx, run } = useEditor();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);

  const entries = (): MenuEntry[] => {
    const ctx = commandCtx();
    return registry
      .all()
      .filter((c) => c.group === "insert" && !HAS_TOOLBAR_BUTTON(c.id) && registry.available(c.id, ctx))
      .map((c): MenuEntry => ({ type: "item", id: c.id, label: c.label, shortcut: undefined, run: ({ animate }) => void run(c.id, { animate }) }));
  };

  return (
    <>
      <Tip label="More objects">
        <button
          ref={anchor}
          type="button"
          aria-label="More objects"
          aria-haspopup="menu"
          aria-expanded={open}
          data-tool="more"
          onClick={(e) => {
            // A click from the keyboard (Enter, Space) has no pointer position: open without the animation.
            setInstant(e.detail === 0);
            setOpen((o) => !o);
          }}
          className={`${chromeButton} gap-1 sm:w-auto sm:px-2.5`}
        >
          <Ellipsis aria-hidden="true" size={18} strokeWidth={1.75} />
          <span aria-hidden="true" className="hidden text-(length:--text-sm) sm:inline">
            More
          </span>
        </button>
      </Tip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} placement="top" role="menu" label="More objects" instant={instant} className="p-1">
        <MenuList entries={entries()} onRun={() => setOpen(false)} />
      </Popover>
    </>
  );
}
