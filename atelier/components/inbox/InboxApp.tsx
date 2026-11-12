"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, FolderInput, Inbox as InboxIcon, Trash2, WifiOff } from "lucide-react";
import { Dialog } from "@/components/home/Dialog";
import { relativeTime } from "@/components/home/library";
import { ToastHost, useToast } from "@/components/home/HomeToast";
import { CaptureForm } from "@/components/chrome/QuickCapture";
import { BoardPicker, loadPickableBoards } from "@/components/library/BoardPicker";
import { buttonDanger, buttonSecondary } from "@/components/ui/controls";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { getAssetResolver } from "@/lib/assets/resolver";
import { AssetUploader } from "@/lib/assets/upload-queue";
import { ingestShare } from "@/lib/inbox/capture";
import { createInboxClient } from "@/lib/inbox/client-factory";
import type { InboxClient, ListedItem } from "@/lib/inbox/inbox-client";
import { drainShares } from "@/lib/inbox/share-queue";
import { hostOf, INBOX_LIMIT, webUrl } from "@/lib/inbox/types";
import { ItemThumb, itemKindLabel, itemName, useInboxAssets, useInboxItems } from "./item-view";

export type InboxServices = {
  client: InboxClient;
  /** Stores pictures and videos as assets (the same pipeline and upload queue as the editor). */
  uploader: Pick<AssetUploader, "addAssetOnly">;
};

/**
 * The client and the uploader behind this page. The uploader has no board: it only adds assets, and it leaves canvas
 * images that a board is still uploading to that board. Created in an effect so that a development double-mount never
 * leaves two clients sending the same queue.
 */
function useServices(localOnly: boolean, notify: (m: string) => void, given?: InboxServices): InboxServices | null {
  const [made, setMade] = useState<InboxServices | null>(null);
  useEffect(() => {
    if (given) return;
    const uploader = new AssetUploader({ doc: new BoardDoc(), resolver: getAssetResolver(), localOnly, resumeCanvasImages: false });
    const client = createInboxClient({ localOnly, uploader, onRejected: (_i, e) => notify(e.message) });
    let alive = true;
    void Promise.resolve().then(() => alive && setMade({ client, uploader }));
    return () => {
      alive = false;
      client.dispose();
      uploader.dispose();
      setMade(null);
    };
    // `notify` is stable (useToast); the services are made once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOnly, given]);
  return given ?? made;
}

type Notice = { tone: "info" | "alert"; text: string; details?: string[] } | null;

export function InboxApp({ localOnly, services }: { localOnly: boolean; services?: InboxServices }) {
  const router = useRouter();
  const { toast, show, dismiss } = useToast();
  const svc = useServices(localOnly, show, services);
  const [showPlaced, setShowPlaced] = useState(false);
  const { items, loaded, status, pending } = useInboxItems(svc?.client ?? null, showPlaced);
  useInboxAssets(items, localOnly);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState<ListedItem[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const headingId = useId();

  // What the phone's share sheet left in IndexedDB goes into the Inbox, once, in the order it arrived.
  useEffect(() => {
    if (!svc) return;
    const query = new URLSearchParams(window.location.search).get("shared");
    let alive = true;
    void (async () => {
      let added = 0;
      let skipped = 0;
      const details: string[] = [];
      await drainShares(indexedDB, async (payload) => {
        const r = await ingestShare(payload, svc.client, svc.uploader);
        added += r.added;
        skipped += r.skipped;
        for (const f of r.failed) details.push(`${f.name}: ${f.message}`);
      });
      if (!alive) return;
      if (query === "error") {
        setNotice({ tone: "alert", text: "Something went wrong receiving what you shared. Try Quick capture instead." });
      } else if (added > 0 || skipped > 0 || details.length > 0) {
        if (skipped > 0) details.push(`${skipped} ${skipped === 1 ? "file was" : "files were"} left out (too large, too many, or not a supported picture or video).`);
        setNotice({ tone: details.length > 0 ? "alert" : "info", text: added > 0 ? `Added ${added} ${added === 1 ? "item" : "items"} you shared.` : "Nothing you shared could be added.", details });
      }
      if (query) {
        try {
          window.history.replaceState(window.history.state, "", window.location.pathname);
        } catch {
          /* the address stays */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [svc]);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const remove = useCallback(
    async (list: ListedItem[]) => {
      if (!svc) return;
      for (const i of list) await svc.client.remove(i.id);
      setSelected(new Set());
      show(list.length === 1 ? "Deleted 1 item." : `Deleted ${list.length} items.`);
    },
    [svc, show],
  );
  const loadBoards = useCallback(() => loadPickableBoards(localOnly), [localOnly]);
  const unplaced = svc?.client.unplaced() ?? 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--z-overlay) border-b border-line bg-canvas">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-md text-(length:--text-sm) text-fg-muted hoverable:text-fg">
            <ArrowLeft size={16} aria-hidden="true" />
            Boards
          </Link>
          <h1 id={headingId} className="mr-auto text-(length:--text-xl) font-semibold">
            Inbox
          </h1>
          {!showPlaced && loaded ? (
            <p role="status" className="text-(length:--text-sm) text-fg-muted">
              {unplaced === 0 ? "Nothing waiting" : `${unplaced} waiting`}
            </p>
          ) : null}
        </div>
      </header>

      <main aria-labelledby={headingId} className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6">
        {localOnly ? (
          <p role="note" className="mb-4 rounded-md border border-line bg-panel px-3 py-2 text-(length:--text-sm) text-fg-muted">
            Local mode: nothing is synced. The Inbox is kept on this device only.
          </p>
        ) : null}
        {status === "needs-login" ? (
          <p role="alert" className="mb-4 rounded-md border border-alert px-3 py-2 text-(length:--text-sm)">
            You&apos;re signed out, so {pending === 1 ? "1 item is" : `${pending} items are`} waiting on this device. <Link href="/login?next=%2Finbox" className="font-medium underline underline-offset-2">Sign in</Link> to send {pending === 1 ? "it" : "them"}.
          </p>
        ) : status === "offline" ? (
          <p role="status" className="mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-(length:--text-sm) text-fg-muted">
            <WifiOff size={14} aria-hidden="true" />
            You&apos;re offline. New items are saved on this device and sent when you&apos;re back.
          </p>
        ) : null}
        {notice ? (
          <div role={notice.tone === "alert" ? "alert" : "status"} className={`mb-4 rounded-md border px-3 py-2 text-(length:--text-sm) ${notice.tone === "alert" ? "border-alert" : "border-line bg-panel"}`}>
            <p>{notice.text}</p>
            {notice.details?.length ? (
              <ul className="mt-1 list-disc pl-5 text-fg-muted">
                {notice.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <section aria-label="Quick capture" className="mb-6 rounded-lg border border-line bg-panel p-4">
          {svc ? <CaptureForm client={svc.client} uploader={svc.uploader} /> : <p className="text-fg-muted">Getting ready…</p>}
        </section>

        <details className="mb-6 rounded-lg border border-line bg-panel px-4 py-3 text-(length:--text-sm)">
          <summary className="min-h-6 cursor-pointer font-medium">How to send things to your Inbox</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
            <li>Android: install Atelier from the browser menu, then use Share in any app and choose Atelier. Pictures, videos, links and text arrive here.</li>
            <li>iPhone and iPad: Safari can&apos;t share into web apps. Use the box above (paste a link or picture, or choose files), or Quick capture on any board.</li>
            <li>Anywhere: press Ctrl+Shift+I (Cmd+Shift+I on a Mac) on a board for Quick capture.</li>
            <li>The Inbox holds up to {INBOX_LIMIT} waiting items. Place them on a board, or delete the ones you don&apos;t need.</li>
          </ul>
        </details>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Show" className="flex gap-1 rounded-lg border border-line bg-panel p-1">
            {[
              { id: false, label: "Waiting" },
              { id: true, label: "Placed" },
            ].map((v) => (
              <button
                key={String(v.id)}
                type="button"
                aria-pressed={showPlaced === v.id}
                onClick={() => {
                  setShowPlaced(v.id);
                  setSelected(new Set());
                }}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-(length:--text-sm) font-medium transition-[background-color,color] duration-(--dur-fast) ease-out ${showPlaced === v.id ? "bg-brand text-on-brand" : "text-fg-muted hoverable:bg-line hoverable:text-fg"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {showPlaced && items.length > 0 ? (
            <button type="button" className={buttonSecondary} onClick={() => setConfirm(items)}>
              <Trash2 size={16} aria-hidden="true" />
              Clear placed items
            </button>
          ) : null}
        </div>

        {selected.size > 0 ? (
          <div role="region" aria-label="Selection" className="sticky top-[4.5rem] z-(--z-overlay) mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2 shadow-2">
            <p className="mr-auto font-medium">{selected.size} selected</p>
            <button type="button" className={buttonSecondary} onClick={() => setSelected(new Set())}>
              Clear
            </button>
            {!showPlaced ? (
              <button type="button" className={buttonSecondary} onClick={() => setPicking(true)}>
                <FolderInput size={16} aria-hidden="true" />
                Open in board…
              </button>
            ) : null}
            <button type="button" className={buttonDanger} onClick={() => setConfirm(chosen)}>
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </button>
          </div>
        ) : null}

        {!loaded ? (
          <p className="text-fg-muted">Loading your Inbox…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-14 text-center">
            <InboxIcon size={28} aria-hidden="true" className="mb-3 text-fg-muted" />
            <p className="text-(length:--text-lg) font-semibold">{showPlaced ? "Nothing placed yet" : "Your Inbox is empty"}</p>
            <p className="mt-1 max-w-sm text-fg-muted">{showPlaced ? "Items you place on a board appear here." : "Paste a link, a thought or a picture above, or share to Atelier from your phone."}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((item) => (
              <Card key={item.id} item={item} selected={selected.has(item.id)} onToggle={() => toggle(item.id)} onDelete={() => setConfirm([item])} />
            ))}
          </ul>
        )}
      </main>

      {picking ? (
        <BoardPicker
          heading="Open which board?"
          load={loadBoards}
          onClose={() => setPicking(false)}
          onPick={(b) => {
            setPicking(false);
            router.push(`/b/${encodeURIComponent(b.id)}?inbox=1`);
          }}
        />
      ) : null}
      {confirm ? <ConfirmDelete count={confirm.length} onClose={() => setConfirm(null)} onConfirm={() => void remove(confirm)} /> : null}
      <ToastHost toast={toast} onDismiss={dismiss} />
    </div>
  );
}

function Card({ item, selected, onToggle, onDelete }: { item: ListedItem; selected: boolean; onToggle: () => void; onDelete: () => void }) {
  const name = itemName(item);
  const href = item.kind === "url" ? webUrl(item.url) : null;
  return (
    <li className="min-w-0">
      <article aria-label={`${name}, ${itemKindLabel(item).toLowerCase()}`} className={`flex h-full flex-col rounded-lg border bg-panel p-2 ${selected ? "border-brand shadow-2" : "border-line"}`}>
        <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line">
          {item.kind === "text" ? (
            <p className="line-clamp-6 h-full w-full overflow-hidden whitespace-pre-wrap break-words bg-canvas p-3 pt-11 text-(length:--text-sm)">{(item.text ?? "").slice(0, 400)}</p>
          ) : (
            <ItemThumb item={item} showHost />
          )}
          <label className="absolute left-1.5 top-1.5 inline-flex size-8 cursor-pointer items-center justify-center rounded-md bg-panel/90 shadow-1 pointer-coarse:size-11">
            <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${name}`} className="size-4 accent-brand" />
          </label>
        </div>
        <div className="mt-2 min-w-0 px-0.5">
          <p className="truncate font-medium" title={name}>
            {name}
          </p>
          <p className="truncate text-(length:--text-sm) text-fg-muted">
            {itemKindLabel(item)}
            {item.kind === "url" ? ` · ${hostOf(item.url)}` : ""}
            {item.pending ? " · Not sent yet" : item.createdAt ? ` · ${relativeTime(item.createdAt)}` : ""}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-(length:--text-sm) font-medium transition-[border-color] duration-(--dur-fast) ease-out pointer-coarse:min-h-11 hoverable:border-fg-muted">
              <ExternalLink size={14} aria-hidden="true" />
              Open{" "}<span className="sr-only">{name}</span>
            </a>
          ) : null}
          <button type="button" onClick={onDelete} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-(length:--text-sm) font-medium transition-[border-color] duration-(--dur-fast) ease-out pointer-coarse:min-h-11 hoverable:border-fg-muted hoverable:text-alert">
            <Trash2 size={14} aria-hidden="true" />
            Delete{" "}<span className="sr-only">{name}</span>
          </button>
        </div>
      </article>
    </li>
  );
}

function ConfirmDelete({ count, onConfirm, onClose }: { count: number; onConfirm: () => void; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog role="alertdialog" labelledBy={`${id}-h`} describedBy={`${id}-d`} onClose={onClose}>
      <h2 id={`${id}-h`} className="mb-2 text-(length:--text-lg) font-semibold">
        Delete {count === 1 ? "this item" : `${count} items`}?
      </h2>
      <p id={`${id}-d`} className="mb-6 text-(length:--text-sm) text-fg-muted">
        They leave your Inbox. Pictures stay in your library, and anything already placed on a board stays there.
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" data-autofocus className={buttonSecondary} onClick={onClose}>
          Keep {count === 1 ? "it" : "them"}
        </button>
        <button
          type="button"
          className={buttonDanger}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </Dialog>
  );
}
