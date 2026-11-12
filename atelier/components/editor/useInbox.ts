"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { getAssetResolver } from "@/lib/assets/resolver";
import type { ToastFn } from "@/lib/engine/commands/registry";
import { screenToCanvas } from "@/lib/engine/geometry/camera";
import type { LinkCardDeps } from "@/lib/engine/links/link-cards";
import type { Point } from "@/lib/engine/model/types";
import type { InboxClient, ListedItem } from "@/lib/inbox/inbox-client";
import { placeInboxItem, type PlaceDeps } from "@/lib/inbox/place";

/** The drag type the Inbox panel puts on an item; its value is the item's id. */
export const INBOX_DRAG_TYPE = "application/x-atelier-inbox";

export type InboxEditorState = {
  client: InboxClient;
  /** Put an item on the board (the middle of the view unless `at` is given), select it, mark it placed. Returns the new object ids. */
  place(item: ListedItem, at?: Point): string[];
};

/**
 * The editor's side of the Inbox: placing an item on the board (from the panel's button, or by dropping it on the canvas), the
 * Quick capture dialog's open state, and `?inbox=1` on the board address (from the Inbox page's "Open in board") opening the panel.
 */
export function useInbox(opts: {
  handle: CanvasHandle;
  client: InboxClient | undefined;
  linkDeps: LinkCardDeps | null;
  toast: ToastFn;
  openPanel: (id: string) => void;
}) {
  const { handle, client, linkDeps, toast, openPanel } = opts;
  const [captureOpen, setCaptureOpen] = useState(false);
  const latest = useRef({ toast, openPanel });
  useEffect(() => {
    latest.current = { toast, openPanel };
  });

  const place = useCallback(
    (item: ListedItem, at?: Point): string[] => {
      if (!client) return [];
      const resolver = getAssetResolver();
      const deps: PlaceDeps = {
        assetInfo: (assetId) => {
          const m = resolver.meta.get(assetId);
          return m ? { kind: m.kind, width: m.width, height: m.height, provenance: m.provenance } : null;
        },
        markPlaced: (id) => client.markPlaced(id),
        links: linkDeps,
      };
      const vp = handle.viewport();
      const point = at ?? screenToCanvas(handle.getCamera(), { x: vp.w / 2, y: vp.h / 2 });
      const ids = placeInboxItem(handle.doc, item, point, deps);
      if (ids.length === 0) {
        latest.current.toast({ message: "That item couldn't be placed." });
        return ids;
      }
      handle.selection.set(ids);
      latest.current.toast({
        message: "Placed on the board.",
        action: {
          label: "Undo",
          run: () => {
            handle.doc.undo();
            void client.markPlaced(item.id, false);
          },
        },
      });
      return ids;
    },
    [client, handle, linkDeps],
  );

  // Dropping an Inbox item (dragged from the panel) on the canvas.
  useEffect(() => {
    const el = handle.container();
    if (!client) return;
    const carries = (dt: DataTransfer | null) => !!dt && Array.from(dt.types ?? []).includes(INBOX_DRAG_TYPE);
    const onOver = (e: DragEvent) => {
      if (!carries(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (e: DragEvent) => {
      if (!carries(e.dataTransfer)) return;
      e.preventDefault();
      const item = client.find(e.dataTransfer!.getData(INBOX_DRAG_TYPE));
      if (!item) return;
      const r = el.getBoundingClientRect();
      place(item, screenToCanvas(handle.getCamera(), { x: e.clientX - r.left, y: e.clientY - r.top }));
    };
    el.addEventListener("dragover", onOver);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("drop", onDrop);
    };
  }, [client, handle, place]);

  // `?inbox=1`: the Inbox page opened this board to place items.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !client) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("inbox") !== "1") return;
    opened.current = true;
    latest.current.openPanel("inbox");
    params.delete("inbox");
    const rest = params.toString();
    try {
      window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : ""));
    } catch {
      /* the address stays; the panel is open */
    }
  }, [client]);

  const state = useMemo<InboxEditorState | null>(() => (client ? { client, place } : null), [client, place]);
  return {
    state,
    captureOpen,
    openCapture: useCallback(() => setCaptureOpen(true), []),
    closeCapture: useCallback(() => setCaptureOpen(false), []),
  };
}
