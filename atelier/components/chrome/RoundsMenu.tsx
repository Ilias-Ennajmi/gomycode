"use client";

import { GitCompareArrows } from "lucide-react";
import { useRef, useState } from "react";
import { useOptionalEditor } from "@/components/editor/EditorContext";
import { chromeButton } from "./controls";
import { MenuList, type MenuEntry } from "./Menu";
import { Popover } from "./Popover";
import { Tip } from "./Tip";

const ITEMS = ["round.publish", "rounds.open", "round.compare", "history.open"] as const;

/**
 * The top bar's rounds menu: Publish round…, the Rounds and Version history panels, Compare. Every entry is a registry command,
 * so the palette offers the same. Renders nothing without an editor around it.
 */
export function RoundsMenu() {
  const editor = useOptionalEditor();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  if (!editor) return null;
  const { registry, commandCtx, run } = editor;

  const entries = (): MenuEntry[] => {
    const ctx = commandCtx();
    return ITEMS.filter((id) => registry.available(id, ctx)).map((id): MenuEntry => ({ type: "item", id, label: registry.get(id).label, run: ({ animate }) => void run(id, { animate }) }));
  };

  return (
    <>
      <Tip label="Rounds and history" side="bottom">
        <button
          ref={anchor}
          type="button"
          aria-label="Rounds and history"
          aria-haspopup="menu"
          aria-expanded={open}
          data-rounds-menu=""
          onClick={(e) => {
            setInstant(e.detail === 0);
            setOpen((o) => !o);
          }}
          className={chromeButton}
        >
          <GitCompareArrows aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
      </Tip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} placement="bottom" align="end" role="menu" label="Rounds and history" instant={instant} className="p-1">
        {open ? <MenuList entries={entries()} onRun={() => setOpen(false)} /> : null}
      </Popover>
    </>
  );
}
