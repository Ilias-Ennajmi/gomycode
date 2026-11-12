"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Images, RefreshCw, Search, Trash2, WifiOff } from "lucide-react";
import { ToastHost, useToast } from "@/components/home/HomeToast";
import { Dialog } from "@/components/home/Dialog";
import { buttonDanger, buttonSecondary, inputClass } from "@/components/ui/controls";
import { createHttpLibraryApi, LibraryLoadError, type LibraryApi } from "@/lib/assets/library-client";
import type { LibraryFilter, LibraryKind, LibrarySort } from "@/lib/assets/library-query";
import type { DuplicateGroup, LibraryAsset } from "@/lib/assets/library-types";
import { createLocalLibraryApi } from "@/lib/assets/local-library";
import { addRequestHref } from "@/lib/assets/place-asset";
import { getAssetResolver } from "@/lib/assets/resolver";
import { registerStoredAssets } from "@/lib/assets/upload-queue";
import { createInboxClient } from "@/lib/inbox/client-factory";
import type { InboxClient } from "@/lib/inbox/inbox-client";
import { AssetGrid, assetName } from "./AssetGrid";
import { BoardPicker, loadPickableBoards } from "./BoardPicker";
import { DuplicateGroups } from "./DuplicateGroups";

type View = "all" | "unused" | "duplicates";
type Load = { state: "loading" } | { state: "ready" } | { state: "offline" } | { state: "failed" };
type Confirm = { assets: LibraryAsset[]; kept: number; label: string } | null;

const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unused", label: "Unused" },
  { id: "duplicates", label: "Possible duplicates" },
];
const SORTS: { id: LibrarySort; label: string }[] = [
  { id: "recent", label: "Newest" },
  { id: "used", label: "Most used" },
  { id: "size", label: "Largest" },
];
const KINDS: { id: LibraryKind | ""; label: string }[] = [
  { id: "", label: "All types" },
  { id: "image", label: "Images" },
  { id: "gif", label: "GIFs" },
  { id: "video", label: "Videos" },
];

const segment = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-md px-3 text-(length:--text-sm) font-medium transition-[background-color,color] duration-(--dur-fast) ease-out ${on ? "bg-brand text-on-brand" : "text-fg-muted hoverable:bg-line hoverable:text-fg"}`;
const selectClass = "min-h-11 rounded-md border border-line bg-panel px-3 text-(length:--text-sm) text-fg";

/**
 * The asset library at /library: everything collected, where it is used, near-duplicates. Signed in it reads the server
 * (`/api/assets`); in local-only mode it reads this device's own storage and says so.
 */
export function LibraryApp({ localOnly, api: apiProp }: { localOnly: boolean; api?: LibraryApi }) {
  const router = useRouter();
  const { toast, show, dismiss } = useToast();
  const api = useMemo(() => apiProp ?? (localOnly ? createLocalLibraryApi() : createHttpLibraryApi()), [apiProp, localOnly]);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<LibraryKind | "">("");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [picking, setPicking] = useState<LibraryAsset | null>(null);
  const [, redraw] = useState(0);
  const run = useRef(0);
  const inbox = useRef<InboxClient | null>(null);
  useEffect(() => () => inbox.current?.dispose(), []);
  const headingId = useId();

  const filter: LibraryFilter = useMemo(() => ({ query, kind: kind || null, sort, unused: view === "unused" }), [query, kind, sort, view]);

  const reload = useCallback(
    async (f: LibraryFilter, v: View) => {
      const mine = ++run.current;
      setLoad({ state: "loading" });
      try {
        // Duplicate groups name assets by id, so that view reads the whole library, not a filtered slice of it.
        const [list, dups] = await Promise.all([api.list(v === "duplicates" ? { query: "", kind: null, sort: "recent", unused: false } : f), v === "duplicates" ? api.duplicates() : Promise.resolve<DuplicateGroup[]>([])]);
        if (mine !== run.current) return;
        setAssets(list);
        setGroups(dups);
        setSelected(new Set());
        setLoad({ state: "ready" });
      } catch (e) {
        if (mine !== run.current) return;
        if (e instanceof LibraryLoadError && e.kind === "login") {
          window.location.replace("/login?next=%2Flibrary");
          return;
        }
        setLoad({ state: e instanceof LibraryLoadError && e.kind === "offline" ? "offline" : "failed" });
      }
    },
    [api],
  );

  // Typing in the search box waits a moment; everything else reloads at once.
  useEffect(() => {
    const t = setTimeout(() => void reload(filter, view), query ? 200 : 0);
    return () => clearTimeout(t);
  }, [filter, view, query, reload]);

  // Thumbnails: signed in, the resolver learns each asset's variants and serves them from R2; local-only, the blobs kept on this device are registered with it.
  const resolver = getAssetResolver();
  useEffect(() => {
    if (localOnly) {
      let alive = true;
      void registerStoredAssets(resolver, assets.map((a) => a.id)).then((n) => alive && n > 0 && redraw((x) => x + 1));
      return () => {
        alive = false;
      };
    }
    for (const a of assets) {
      resolver.remember({ id: a.id, kind: a.kind, width: a.width, height: a.height, bytes: a.bytes, variants: a.variants, palette: a.palette, phash: a.phash, title: a.title, provenance: a.provenance, analysisVersion: a.analysisVersion });
    }
  }, [assets, localOnly, resolver]);
  // The resolver tells us when a URL or an asset's variants changed (remember() above, blobs registered).
  useEffect(() => resolver.subscribe(() => redraw((x) => x + 1)), [resolver]);
  const thumbUrl = useCallback((a: LibraryAsset) => resolver.url(a.id, "w256"), [resolver]);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const askDelete = (list: LibraryAsset[]) => {
    const deletable = list.filter((a) => a.usedIn === 0);
    if (deletable.length === 0) return;
    setConfirm({
      assets: deletable,
      kept: list.length - deletable.length,
      label: deletable.length === 1 ? `“${assetName(deletable[0])}”` : `${deletable.length} pictures`,
    });
  };

  async function doDelete(list: LibraryAsset[]) {
    const removed: string[] = [];
    let problem = "";
    for (const a of list) {
      const r = await api.remove(a.id);
      if (r.ok) removed.push(a.id);
      else problem = r.message;
    }
    if (removed.length > 0) {
      const gone = new Set(removed);
      setAssets((cur) => cur.filter((a) => !gone.has(a.id)));
      setSelected((cur) => new Set([...cur].filter((id) => !gone.has(id))));
      if (view === "duplicates") void reload(filter, view);
    }
    if (problem) show(removed.length > 0 ? `Deleted ${removed.length}. ${problem}` : problem);
    else show(removed.length === 1 ? "Deleted 1 picture." : `Deleted ${removed.length} pictures.`);
  }

  // "Send to Inbox": the picture waits in the Inbox, so it can be placed on any board from the editor's Inbox panel.
  async function sendToInbox(a: LibraryAsset) {
    inbox.current ??= createInboxClient({ localOnly, onRejected: (_item, e) => show(e.message) });
    await inbox.current.add({
      kind: a.kind === "video" ? "video" : "image",
      assetId: a.id,
      url: null,
      text: null,
      title: a.title.trim() ? a.title.trim().slice(0, 300) : null,
      sourceUrl: a.provenance?.sourceUrl ?? null,
      credit: a.provenance?.credit ? a.provenance.credit.slice(0, 500) : null,
    });
    show(`Sent “${assetName(a)}” to your Inbox.`);
  }

  const selectedAssets = assets.filter((a) => selected.has(a.id));
  const duplicateIds = useMemo(() => new Set(groups.flatMap((g) => g.assetIds)), [groups]);
  const shownAssets = view === "duplicates" ? assets.filter((a) => duplicateIds.has(a.id)) : assets;
  const loadBoards = useCallback(() => loadPickableBoards(localOnly), [localOnly]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--z-overlay) border-b border-line bg-canvas">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-md text-(length:--text-sm) text-fg-muted hoverable:text-fg">
            <ArrowLeft size={16} aria-hidden="true" />
            Boards
          </Link>
          <h1 id={headingId} className="mr-auto text-(length:--text-xl) font-semibold">
            Library
          </h1>
          <div className="relative order-last w-full md:order-none md:w-80">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="search"
              aria-label="Search the library"
              placeholder="Search title, credit or source"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              disabled={view === "duplicates"}
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>
      </header>

      <main aria-labelledby={headingId} className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6">
        {localOnly ? (
          <p role="note" className="mb-4 rounded-md border border-line bg-panel px-3 py-2 text-(length:--text-sm) text-fg-muted">
            Local mode: nothing is synced. This library shows the pictures stored on this device, and “Used in” counts boards on this device.
          </p>
        ) : null}

        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div role="group" aria-label="Show" className="flex gap-1 rounded-lg border border-line bg-panel p-1">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} className={segment(view === v.id)} onClick={() => setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-(length:--text-sm) text-fg-muted">
            <span className="sr-only sm:not-sr-only">Type</span>
            <select aria-label="Type" className={selectClass} value={kind} disabled={view === "duplicates"} onChange={(e) => setKind(e.target.value as LibraryKind | "")}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-(length:--text-sm) text-fg-muted">
            <span className="sr-only sm:not-sr-only">Sort</span>
            <select aria-label="Sort by" className={selectClass} value={sort} disabled={view === "duplicates"} onChange={(e) => setSort(e.target.value as LibrarySort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <p role="status" aria-live="polite" className="ml-auto text-(length:--text-sm) text-fg-muted">
            {load.state === "ready" ? (view === "duplicates" ? `${groups.length} ${groups.length === 1 ? "group" : "groups"}` : `${shownAssets.length} ${shownAssets.length === 1 ? "item" : "items"}`) : ""}
          </p>
        </div>

        {selected.size > 0 && view !== "duplicates" ? (
          <div role="region" aria-label="Selection" className="sticky top-[4.5rem] z-(--z-overlay) mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2 shadow-2">
            <p className="mr-auto font-medium">{selected.size} selected</p>
            <button type="button" className={buttonSecondary} onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button type="button" className={buttonDanger} disabled={selectedAssets.every((a) => a.usedIn > 0)} onClick={() => askDelete(selectedAssets)}>
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </button>
          </div>
        ) : null}

        {load.state === "loading" && assets.length === 0 ? (
          <p className="text-fg-muted">Loading your library…</p>
        ) : load.state === "offline" || load.state === "failed" ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-14 text-center">
            {load.state === "offline" ? <WifiOff size={28} aria-hidden="true" className="mb-3 text-fg-muted" /> : null}
            <p className="text-(length:--text-lg) font-semibold">{load.state === "offline" ? "You're offline" : "Couldn't load the library"}</p>
            <p className="mt-1 max-w-sm text-fg-muted">{load.state === "offline" ? "The library lives on the server. Reconnect and try again." : "Something went wrong on the server. Try again in a moment."}</p>
            <button type="button" className={`${buttonSecondary} mt-5`} onClick={() => void reload(filter, view)}>
              <RefreshCw size={16} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : view === "duplicates" ? (
          <DuplicateGroups
            groups={groups}
            assets={assets}
            thumbUrl={thumbUrl}
            onDeleteUnused={(copies) => setConfirm({ assets: copies, kept: 0, label: copies.length === 1 ? "1 unused copy" : `${copies.length} unused copies` })}
          />
        ) : shownAssets.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-16 text-center">
            <Images size={28} aria-hidden="true" className="mb-4 text-fg-muted" />
            <p className="text-(length:--text-lg) font-semibold">{query || kind || view !== "all" ? "Nothing matches" : "Your library is empty"}</p>
            <p className="mt-1 max-w-sm text-fg-muted">
              {query || kind || view !== "all" ? "Try a different word or filter." : "Pictures you add to boards or the Inbox collect here, and you can reuse them on any board."}
            </p>
          </div>
        ) : (
          <AssetGrid
            assets={shownAssets}
            thumbUrl={thumbUrl}
            selected={selected}
            onToggleSelect={toggle}
            onDelete={(a) => askDelete([a])}
            onAddToBoard={setPicking}
            onSendToInbox={(a) => void sendToInbox(a)}
            onShowDuplicates={() => setView("duplicates")}
            boardHref={(id) => `/b/${id}`}
          />
        )}
        {view === "all" && load.state === "ready" && assets.length >= 200 ? <p className="mt-6 text-center text-(length:--text-sm) text-fg-muted">Showing the first 200. Use search or a filter to narrow the library.</p> : null}
      </main>

      {confirm ? <ConfirmDelete confirm={confirm} onClose={() => setConfirm(null)} onConfirm={() => void doDelete(confirm.assets)} /> : null}
      {picking ? (
        <BoardPicker
          load={loadBoards}
          onClose={() => setPicking(null)}
          onPick={(board) => {
            const a = picking;
            setPicking(null);
            router.push(addRequestHref(board.id, { assetId: a.id, kind: a.kind, width: a.width, height: a.height }));
          }}
        />
      ) : null}
      <ToastHost toast={toast} onDismiss={dismiss} />
    </div>
  );
}

function ConfirmDelete({ confirm, onConfirm, onClose }: { confirm: NonNullable<Confirm>; onConfirm: () => void; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog role="alertdialog" labelledBy={`${id}-h`} describedBy={`${id}-d`} onClose={onClose}>
      <h2 id={`${id}-h`} className="mb-2 text-(length:--text-lg) font-semibold">
        Delete {confirm.label}?
      </h2>
      <p id={`${id}-d`} className="mb-6 text-(length:--text-sm) text-fg-muted">
        The stored files are removed for good and this can&apos;t be undone. Anything waiting in your Inbox that points at them goes too.
        {confirm.kept > 0 ? ` ${confirm.kept} ${confirm.kept === 1 ? "picture is" : "pictures are"} on boards and will be kept.` : ""}
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" data-autofocus className={buttonSecondary} onClick={onClose}>
          Keep {confirm.assets.length === 1 ? "it" : "them"}
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
