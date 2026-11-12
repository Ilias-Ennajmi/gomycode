"use client";

import { CirclePlay, ExternalLink, RefreshCw } from "lucide-react";
import { useEditor } from "@/components/editor/EditorContext";
import type { EmbedObj, LinkObj } from "@/lib/engine/model/types";
import { chromeTextButton } from "./controls";
import { Tip } from "./Tip";

/**
 * The selection bar's controls for one link card or embed: Open link (the card's page or the embed's original address),
 * Play for an embed, and Retry preview for a card whose preview is missing. A plain click on the canvas only selects;
 * these are the pointer route to what double-click and Enter do.
 */
export function LinkBarControls({ obj, side }: { obj: LinkObj | EmbedObj; side: "top" | "bottom" }) {
  const { run, registry, commandCtx } = useEditor();
  const retry = obj.type === "link" && registry.available("link.retryPreview", commandCtx());
  return (
    <>
      {obj.type === "embed" ? (
        <Tip label="Play" shortcut="Enter" side={side}>
          <button type="button" aria-label="Play" onClick={() => void run("embed.play")} className={chromeTextButton}>
            <CirclePlay aria-hidden="true" size={18} strokeWidth={1.75} />
            <span className="hidden text-(length:--text-sm) sm:inline">Play</span>
          </button>
        </Tip>
      ) : null}
      <Tip label={obj.type === "embed" ? "Open the original page" : "Open link in a new tab"} shortcut={obj.type === "link" ? "Enter" : undefined} side={side}>
        <button type="button" aria-label="Open link" onClick={() => void run("link.open")} className={chromeTextButton}>
          <ExternalLink aria-hidden="true" size={18} strokeWidth={1.75} />
          <span className="hidden text-(length:--text-sm) sm:inline">Open link</span>
        </button>
      </Tip>
      {retry ? (
        <Tip label="Retry preview" side={side}>
          <button type="button" aria-label="Retry preview" onClick={() => void run("link.retryPreview")} className={chromeTextButton}>
            <RefreshCw aria-hidden="true" size={18} strokeWidth={1.75} />
            <span className="hidden text-(length:--text-sm) sm:inline">Retry</span>
          </button>
        </Tip>
      ) : null}
    </>
  );
}
