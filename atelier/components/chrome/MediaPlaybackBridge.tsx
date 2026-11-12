"use client";

import { useEffect } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { getPlaybackStore } from "@/lib/engine/media/playback-store";

/**
 * Connects the playback store to the editor: it learns what is selected (a live video that is off-screen and not
 * selected returns to its poster), Escape sends every live video back to its poster, a deleted video gives its slot
 * back, and leaving the board stops everything. Renders nothing.
 */
export function MediaPlaybackBridge() {
  const { handle } = useEditor();
  useEffect(() => {
    const store = getPlaybackStore();
    const { selection, doc } = handle;
    const sync = () => store.setSelected(selection.ids);
    sync();
    const offSelection = selection.subscribe(sync);
    const offDoc = doc.onChange((changed) => {
      for (const id of changed) if (!doc.get(id) && store.state(id) !== "off") store.deactivate(id);
    });
    // Not prevented: Escape still clears the selection as it does everywhere else.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && store.activeIds().length > 0) store.deactivateAll();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      offSelection();
      offDoc();
      document.removeEventListener("keydown", onKey);
      store.deactivateAll();
      store.setSelected([]);
    };
  }, [handle]);
  return null;
}
