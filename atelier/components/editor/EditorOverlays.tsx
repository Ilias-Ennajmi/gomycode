"use client";

import { MediaPlaybackBridge } from "@/components/chrome/MediaPlaybackBridge";
import { ToastViewport } from "@/components/chrome/Toast";
import { CommandPalette } from "@/components/panels/CommandPalette";
import { PanelHost, type PanelDef } from "@/components/panels/PanelHost";

/**
 * The editor's floating layers that every board shows: the right-hand panel (Layers, Inspector, Find and replace),
 * the command palette and the toasts. Render inside <EditorProvider>; the chrome (top bar, toolbar, ...) goes next to it.
 */
export function EditorOverlays({ panels }: { panels?: PanelDef[] }) {
  return (
    <>
      <PanelHost panels={panels} />
      <CommandPalette />
      <ToastViewport />
      <MediaPlaybackBridge />
    </>
  );
}
