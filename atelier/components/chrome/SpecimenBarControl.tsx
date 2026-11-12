"use client";

import { CaseSensitive, ChevronDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { SpecimenFields } from "@/components/panels/SpecimenFields";
import type { TypeSpecimenObj } from "@/lib/engine/model/types";
import { chromeButton } from "./controls";
import { Popover } from "./Popover";
import { Tip } from "./Tip";

/** The selection bar's control for a type specimen: a "Type" button that opens the same fields as the Inspector. */
export function SpecimenBarControl({ obj, side }: { obj: TypeSpecimenObj; side: "top" | "bottom" }) {
  const { doc } = useEditor().handle;
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const label = `Type: ${obj.family || "none"}, ${obj.weight}`;
  return (
    <>
      <Tip label="Type" side={side}>
        <button
          ref={anchor}
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${chromeButton} w-auto min-w-9 gap-0.5 px-1.5 pointer-coarse:w-auto pointer-coarse:min-w-11`}
        >
          <CaseSensitive aria-hidden="true" size={18} strokeWidth={1.75} />
          <ChevronDown aria-hidden="true" size={12} strokeWidth={2} className="text-fg-muted" />
        </button>
      </Tip>
      <Popover open={open} onClose={close} anchor={anchor} placement={side} role="dialog" label="Type specimen" className="p-3">
        <div className="w-72">
          <SpecimenFields obj={obj} doc={doc} />
        </div>
      </Popover>
    </>
  );
}
