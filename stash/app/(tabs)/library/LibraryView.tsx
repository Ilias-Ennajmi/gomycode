"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ClipboardPaste, Layers, Play, Search, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Banner } from "@/components/ui/Banner";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SpacePicker } from "@/components/save/SpacePicker";
import { PasteLinkSheet } from "@/components/library/PasteLinkSheet";
import { SpaceColorSheet } from "@/components/space/ColorPicker";
import { LensToggle, isLens, type Lens } from "@/components/library/LensToggle";
import { CollectionHeader, CollectionsRow } from "@/components/library/Collections";
import { AskSheet } from "@/components/ask/AskEntry";
import { useCollections } from "@/lib/hooks/useCollections";
import { collectionSaves, findCollection } from "@/lib/collections";
import { searchSaves, type Hit } from "@/lib/search";
import { looksLikeQuestion } from "@/lib/askState";
import { SaveGrid, cardText } from "@/components/library/SaveGrid";
import { SPACE_BG } from "@/components/ui/space";
import { cx } from "@/components/ui/cx";
import { useAppearance } from "@/components/theme/ThemeProvider";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { createSpace, nextSpaceColor, updateSpace, type SaveItem } from "@/lib/data";
import { FILTER_LABEL, FILTERS, filterSaves, isFilter, spaceCounts, type Filter } from "@/lib/queue";
import { formatDuration } from "@/components/ui/Thumbnail";
import { triageCandidates } from "@/lib/triage";
import { morphTo } from "@/lib/morph";

// Leaflet touches `window` when it loads, so the map is client-only.
const MapView = dynamic(() => import("@/components/library/MapView"), {
  ssr: false,
  loading: () => (
    <div className="px-4">
      <Skeleton shape="block" className="h-96" />
    </div>
  ),
});

// The Galaxy's pan / zoom code is only fetched when its lens opens.
const GalaxyView = dynamic(() => import("@/components/library/GalaxyView").then((m) => m.GalaxyView), {
  ssr: false,
  loading: () => (
    <div className="px-4">
      <Skeleton shape="block" className="aspect-square w-full rounded-xl" />
    </div>
  ),
});

export function LibraryView() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { appearance } = useAppearance();
  const lib = useLibrary();

  const [space, setSpace] = useState<string | null>(params.get("space"));
  const [filter, setFilter] = useState<Filter>(isFilter(params.get("filter")) ? (params.get("filter") as Filter) : "all");
  // Today's empty state links here with ?paste=1 to open "Paste a link" straight away.
  const [pasteOpen, setPasteOpen] = useState(params.get("paste") === "1");
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>(isLens(params.get("lens")) ? (params.get("lens") as Lens) : "grid");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [byMeaning, setByMeaning] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(params.get("c"));
  // Today links here with ?ask=1 to open "Ask your saves" straight away.
  const [ask, setAsk] = useState<{ open: boolean; question?: string }>({ open: params.get("ask") === "1" });
  const searchRun = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const inbox = lib.spaces.find((s) => s.kind === "inbox") ?? null;
  const inboxId = inbox?.id ?? null;
  const spacesById = useMemo(() => new Map(lib.spaces.map((s) => [s.id, s])), [lib.spaces]);
  const counts = useMemo(() => spaceCounts(lib.saves, inboxId), [lib.saves, inboxId]);
  const selectedId = space === "inbox" ? inboxId : space;
  const selected = selectedId ? spacesById.get(selectedId) : undefined;
  const readyCount = useMemo(() => lib.saves.filter((s) => s.status === "ready").length, [lib.saves]);
  const collections = useCollections(lib.saves, lib.synced ? `synced:${readyCount}` : "");
  const collection = findCollection(collections, collectionId);
  const visible = useMemo(
    () =>
      collection
        ? // A smart group is its own list of saves; the filter chips still narrow it.
          filterSaves(collectionSaves(collection, lib.saves), { space: null, filter, inboxId })
        : // ?space=inbox (the Inbox shortcut) filters at once, before the Spaces have loaded.
          filterSaves(lib.saves, { space: space === "inbox" || (selectedId && selectedId === inboxId) ? "inbox" : selectedId, filter, inboxId }),
    [lib.saves, space, selectedId, filter, inboxId, collection],
  );
  const byId = useMemo(() => new Map(lib.saves.map((s) => [s.id, s])), [lib.saves]);
  const [openedAt] = useState(() => new Date());
  const oldCount = useMemo(() => triageCandidates(lib.saves, openedAt).length, [lib.saves, openedAt]);

  // Shortcut "Search" (?search=1) opens with the field focused, as soon as the field exists.
  const wantSearch = useRef(params.get("search") === "1");
  useEffect(() => {
    if (wantSearch.current && searchRef.current) {
      searchRef.current.focus();
      wantSearch.current = false;
    }
  }, [lib.loading, lib.saves.length]);

  // Keep the selection in the URL so back and the Play button keep context.
  useEffect(() => {
    const q = new URLSearchParams();
    if (space) q.set("space", space);
    if (filter !== "all") q.set("filter", filter);
    if (lens !== "grid") q.set("lens", lens);
    if (collectionId) q.set("c", collectionId);
    const next = q.toString();
    if (next !== window.location.search.replace(/^\?/, "")) {
      window.history.replaceState(window.history.state, "", next ? `?${next}` : window.location.pathname);
    }
  }, [space, filter, lens, collectionId]);

  const playHref = (() => {
    if (collection) return visible.length ? `/play?ids=${visible.slice(0, 60).map((s) => s.id).join(",")}` : "/play";
    const q = new URLSearchParams();
    if (space) q.set("space", space);
    q.set("filter", filter);
    return `/play?${q.toString()}`;
  })();

  const runSearch = async (text: string) => {
    const q = text.trim();
    if (!q) {
      setHits(null);
      return;
    }
    const run = ++searchRun.current;
    setSearching(true);
    setByMeaning(false);
    setHits((h) => h ?? []);
    // Word matches show first; matches by meaning join them a moment later. If the meaning
    // part fails (or the phone is offline) the words, or the saves on the phone, are the answer.
    const result = await searchSaves(q, {
      spaceId: selectedId,
      saves: lib.saves,
      onWords: (words) => run === searchRun.current && setHits(words),
    });
    if (run !== searchRun.current) return;
    setHits(result.hits);
    setByMeaning(result.byMeaning);
    setSearching(false);
  };

  const clearSearch = () => {
    searchRun.current++;
    setQuery("");
    setHits(null);
    setSearching(false);
  };

  const pickCollection = (id: string | null) => {
    setCollectionId(id);
    if (id) setSpace(null);
  };

  // The thumbnail grows into the item's player (View Transition; plain navigation without it).
  const open = (s: SaveItem, t?: number | null) => morphTo(router, t ? `/item/${s.id}?t=${Math.floor(t)}` : `/item/${s.id}`, s.id);

  const newSpace = async (name: string) => {
    try {
      const created = await createSpace(name, nextSpaceColor(lib.spaces));
      lib.setSpaces((prev) => [...prev, created]);
      setSpace(created.id);
    } catch {
      toast({ message: "New Spaces need a connection." });
    }
  };

  const empty = !lib.loading && lib.saves.length === 0 && lib.queued.length === 0;
  const hitSaves = (hits ?? []).map((h) => ({ hit: h, save: byId.get(h.saveId) })).filter((x) => x.save);

  return (
    <div className="flex flex-col gap-3 pb-24">
      <PageHeader
        title="Library"
        trailing={
          <div className="flex items-center gap-1">
            <IconButton label="Save a link" icon={ClipboardPaste} variant="raised" onClick={() => setPasteOpen(true)} />
            {!empty && (
              <Link
                href={playHref}
                aria-label={selected ? `Play ${selected.name}` : "Play these saves"}
                className="press flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent shadow-pop"
              >
                <Play size={24} strokeWidth={2} fill="currentColor" aria-hidden />
              </Link>
            )}
          </div>
        }
      />

      {lib.error && (
        <div className="px-4">
          <Banner action={<button className="tap px-2 text-label underline" onClick={() => void lib.refresh()}>Retry</button>}>
            {lib.error}
          </Banner>
        </div>
      )}

      <div className="px-4">
        <LensToggle value={lens} onChange={setLens} />
      </div>

      {empty && lens === "grid" ? (
        <EmptyState
          illustration="empty"
          title="Nothing stashed yet"
          message="In Instagram or TikTok, tap Share on a reel, then pick Stash. It lands here."
          actionLabel="Paste a link"
          actionIcon={ClipboardPaste}
          onAction={() => setPasteOpen(true)}
        />
      ) : (
        <>
          <div className="px-5">
            <SpacePicker
              spaces={lib.spaces}
              selectedId={selectedId}
              counts={counts}
              onPick={(id) => {
                setSpace(id && id === inboxId ? "inbox" : id);
                if (id) setCollectionId(null);
              }}
              onCreate={newSpace}
              onLongPress={(id) => id !== inboxId && setColorFor(id)}
            />
          </div>

          {selected && selected.kind !== "inbox" && (
            <Link
              href={`/s/${selected.id}`}
              className={cx("press rise-in mx-4 flex min-h-16 items-center gap-3 rounded-lg px-5 text-on-space", SPACE_BG[selected.color])}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-title">{selected.name}</span>
                <span className="text-caption">
                  {counts[selected.id] ?? 0} {(counts[selected.id] ?? 0) === 1 ? "save" : "saves"} · open the Space
                </span>
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-on-space/15">
                <ArrowRight size={22} strokeWidth={2.25} aria-hidden />
              </span>
            </Link>
          )}

          {oldCount > 0 && !selectedId && !collection && lens === "grid" && hits === null && (
            <Link href="/triage" className="press mx-4 flex min-h-14 items-center gap-3 rounded-lg bg-surface px-4 text-label text-fg shadow-pop">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised">
                <Layers size={20} strokeWidth={2} aria-hidden />
              </span>
              <span className="flex-1 truncate">
                {oldCount} old {oldCount === 1 ? "save" : "saves"} to sort · 30 s
              </span>
              <ArrowRight size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
            </Link>
          )}

          <div className="scroll-area flex gap-1 overflow-x-auto px-4" role="group" aria-label="Filter">
            {FILTERS.map((f) => (
              <Chip key={f} label={FILTER_LABEL[f]} selected={filter === f} onClick={() => setFilter(f)} />
            ))}
          </div>

          {lens === "grid" && hits === null && (!selectedId || collection) && (
            <CollectionsRow collections={collections} selectedId={collection?.id ?? null} onPick={(c) => pickCollection(c?.id ?? null)} />
          )}

          {collection && hits === null && lens === "grid" && (
            <CollectionHeader collection={collection} count={visible.length} playHref={visible.length ? playHref : null} onClose={() => pickCollection(null)} />
          )}

          {hits !== null ? (
            <section aria-label="Search results" className="flex flex-col gap-2 px-4">
              <button
                type="button"
                onClick={() => setAsk({ open: true, question: query.trim() })}
                className={cx(
                  "press flex min-h-14 items-center gap-3 rounded-lg bg-surface px-4 py-2 text-left shadow-pop",
                  looksLikeQuestion(query) && "ring-1 ring-insight/50",
                )}
              >
                <Sparkles size={22} strokeWidth={2} aria-hidden className="shrink-0 text-insight" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-label text-insight">Ask your saves</span>
                  <span className="line-clamp-1 text-caption text-fg-muted">Get an answer to “{query.trim()}”, with the saves it came from</span>
                </span>
                <ArrowRight size={20} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
              </button>
              <div className="flex items-center justify-between">
                <h2 className="text-heading">
                  {searching && hitSaves.length === 0 ? "Searching…" : `${hitSaves.length} ${hitSaves.length === 1 ? "result" : "results"}`}
                  {(searching || byMeaning) && hitSaves.length > 0 && (
                    <span className="ml-2 text-caption text-fg-muted">{searching ? "looking by meaning…" : "by words and meaning"}</span>
                  )}
                </h2>
                {hitSaves.length > 0 && (
                  <Link
                    href={`/play?ids=${hitSaves.map((x) => x.hit.saveId).join(",")}`}
                    className="press flex h-12 items-center gap-2 rounded-full bg-accent px-4 text-label text-on-accent"
                  >
                    <Play size={20} strokeWidth={2} fill="currentColor" aria-hidden /> Play all
                  </Link>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {hitSaves.map(({ hit, save }) => (
                  <li key={hit.saveId}>
                    <button
                      type="button"
                      onClick={() => open(save!, hit.start)}
                      className="press flex w-full gap-3 rounded-lg bg-surface p-2 text-left shadow-pop"
                    >
                      <span className="relative h-24 w-16 shrink-0 overflow-hidden rounded-card bg-raised">
                        {save!.thumbPath && lib.thumbs[save!.thumbPath] && (
                          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                          <img src={lib.thumbs[save!.thumbPath]} alt="" className="h-full w-full object-cover" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col gap-1 py-1">
                        <span className="line-clamp-2 text-label text-fg">{cardText(save!)}</span>
                        {hit.snippet && (
                          <span className="line-clamp-2 text-caption text-fg-muted">
                            “{hit.snippet}”{hit.start !== null && ` · ${formatDuration(hit.start)}`}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!searching && hitSaves.length === 0 && (
                <EmptyState illustration="search" title="No match yet" message="Try other words, or something you remember hearing." />
              )}
            </section>
          ) : lens === "map" ? (
            <MapView saves={visible} spacesById={spacesById} thumbs={lib.thumbs} onOpen={(s) => open(s)} />
          ) : lens === "galaxy" ? (
            <GalaxyView
              saves={visible}
              totalReady={lib.saves.filter((s) => s.status === "ready" && !s.archivedAt).length}
              filterLabel={selected ? selected.name : filter !== "all" ? FILTER_LABEL[filter] : null}
              spacesById={spacesById}
              onOpen={(s) => open(s)}
            />
          ) : lib.loading && lib.saves.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 px-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} shape="thumb" />
              ))}
            </div>
          ) : visible.length === 0 && (selectedId || collection || filter !== "all") ? (
            <EmptyState illustration="done" title="All clear here" message="Nothing matches this filter. Pick another chip or Space." />
          ) : (
            <SaveGrid
              items={visible}
              queued={!selectedId && !collection && filter === "all" ? lib.queued.slice(0, 6) : []}
              thumbs={lib.thumbs}
              spacesById={spacesById}
              justReady={lib.justReady}
              density={appearance.density}
              onOpen={(s) => open(s)}
            />
          )}
        </>
      )}

      {/* The floating search bar would cover the Galaxy map, which has its own pan and zoom. */}
      {!empty && lens !== "galaxy" && (
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
            searchRef.current?.blur();
          }}
          className="fixed inset-x-0 z-20 mx-auto flex max-w-xl px-4"
          style={{ bottom: "calc(var(--bar-height) + var(--play-raise) + env(safe-area-inset-bottom) + var(--space-2))" }}
        >
          <label htmlFor="library-search" className="sr-only">
            Search what was said
          </label>
          <div className="flex h-14 w-full items-center gap-2 rounded-full border border-line bg-surface pl-5 pr-1 shadow-raised focus-within:border-fg">
            <Search size={20} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
            <input
              id="library-search"
              ref={searchRef}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value) setHits(null);
              }}
              placeholder="Search what was said…"
              className="h-full min-w-0 flex-1 bg-transparent text-input text-fg outline-none placeholder:text-fg-subtle"
            />
            {(query || hits) && <IconButton label="Clear search" icon={X} onClick={clearSearch} />}
            <button
              type="button"
              aria-label="Ask your saves"
              onClick={() => setAsk({ open: true, question: looksLikeQuestion(query) ? query.trim() : undefined })}
              className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-raised text-insight"
            >
              <Sparkles size={22} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </form>
      )}

      {colorFor && spacesById.get(colorFor) && (
        <SpaceColorSheet
          open
          onClose={() => setColorFor(null)}
          name={spacesById.get(colorFor)!.name}
          value={spacesById.get(colorFor)!.color}
          onPick={(c) => {
            const id = colorFor;
            lib.setSpaces((prev) => prev.map((s) => (s.id === id ? { ...s, color: c } : s)));
            updateSpace(id, { color_token: c }).catch(() => {
              toast({ message: "Couldn't change the colour. Check your connection." });
              void lib.refresh();
            });
          }}
        />
      )}

      <AskSheet
        open={ask.open}
        onClose={() => setAsk({ open: false })}
        initialQuestion={ask.question}
        saves={lib.saves}
        thumbs={lib.thumbs}
        onOpenSave={(s) => {
          setAsk({ open: false });
          router.push(`/item/${s.id}`);
        }}
      />

      <PasteLinkSheet open={pasteOpen} onClose={() => setPasteOpen(false)} spaceId={selectedId === inboxId ? null : selectedId} onSaved={() => toast({ message: "Saved" })} />
    </div>
  );
}
