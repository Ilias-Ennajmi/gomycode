"use client";

import { Copyright } from "lucide-react";
import { useEditor } from "@/components/editor/EditorContext";
import { SourceFields } from "@/components/panels/SourceFields";
import type { ImageObj, VideoObj } from "@/lib/engine/model/types";
import { BarPopoverButton } from "./bar-popover";

/** The selection bar's "Source" button for one picture or video: the Inspector's Source fields in a popover. */
export function SourceBarControl({ obj, side }: { obj: ImageObj | VideoObj; side: "top" | "bottom" }) {
  const { doc } = useEditor().handle;
  return (
    <BarPopoverButton
      label="Source and credit"
      face={<Copyright aria-hidden="true" size={18} strokeWidth={1.75} />}
      side={side}
    >
      <div className="w-72">
        <SourceFields key={obj.id} obj={obj} doc={doc} disabled={obj.locked} />
      </div>
    </BarPopoverButton>
  );
}
