"use client";

import Link from "next/link";
import { ArrowUpRight, Plus, Zap } from "lucide-react";
import { INBOX_DRAG_TYPE } from "@/components/editor/useInbox";
import { useEditor } from "@/components/editor/EditorContext";
import { ItemThumb, itemKindLabel, itemName, useInboxAssets, useInboxItems } from "@/components/inbox/item-view";
import { buttonSecondary } from "@/components/ui/controls";

/**
 * The editor's right-hand Inbox panel: what is waiting in the Inbox, each item with "Add to board" (places it in the middle
 * of the view) and draggable onto the canvas. Pictures reuse the asset they already have; links become cards or embeds; notes
 * become text. Placing is one undo step and the item leaves the list.
 */
export function InboxPanel() {
  const { inbox, openCapture } = useEditor();
  const { items, loaded, status, pending } = useInboxItems(inbox?.client ?? null);
  useInboxAssets(items, false);

  if (!inbox) return <p className="p-4 text-(length:--text-sm) text-fg-muted">The Inbox isn&apos;t available here.</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col text-(length:--text-sm)">
      <div className="shrink-0 border-b border-line p-3">
        {status === "needs-login" ? (
          <p role="status" className="mb-2 text-alert">
            Sign in again to send {pending === 1 ? "the item" : `${pending} items`} waiting on this device.
          </p>
        ) : status === "offline" && pending > 0 ? (
          <p role="status" className="mb-2 text-fg-muted">
            Offline. {pending === 1 ? "1 change is" : `${pending} changes are`} saved on this device and will be sent when you&apos;re back.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${buttonSecondary} min-h-(--target-coarse) px-3 text-(length:--text-sm)`} onClick={openCapture}>
            <Zap size={14} aria-hidden="true" />
            Quick capture
          </button>
          <Link href="/inbox" className="inline-flex min-h-(--target-min) items-center gap-1 rounded-sm text-brand underline underline-offset-2">
            Open the Inbox page
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!loaded ? (
          <p className="text-fg-muted">Loading the Inbox…</p>
        ) : items.length === 0 ? (
          <p className="text-fg-muted">Nothing is waiting. Share a picture or link to Atelier from your phone, or use Quick capture, and it shows up here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const name = itemName(item);
              return (
                <li
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(INBOX_DRAG_TYPE, item.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex items-center gap-3 rounded-md border border-line bg-canvas p-2 active:cursor-grabbing"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-sm border border-line">
                    <ItemThumb item={item} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={name}>
                      {name}
                    </p>
                    <p className="text-(length:--text-xs) text-fg-muted">
                      {itemKindLabel(item)}
                      {item.pending ? <> · <span>Not sent yet</span></> : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Add ${name} to board`}
                    onClick={() => inbox.place(item)}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel transition-[transform,border-color] duration-(--dur-fast) ease-out active:scale-[0.97] pointer-coarse:size-11 hoverable:border-fg-muted"
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
