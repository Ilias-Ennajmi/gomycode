"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ClipboardPaste, Play, Search, Share2, X } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Banner } from "@/components/ui/Banner";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SpacePicker } from "@/components/save/SpacePicker";
import { PasteLinkSheet } from "@/components/library/PasteLinkSheet";
import { SaveGrid, cardText } from "@/components/library/SaveGrid";
import { SPACE_BG } from "@/components/ui/space";
import { cx } from "@/components/ui/cx";
import { useAppearance } from "@/components/theme/ThemeProvider";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { createSpace, nextSpaceColor, type SaveItem } from "@/lib/data";
import { FILTER_LABEL, FILTERS, filterSaves, isFilter, spaceCounts, type Filter } from "@/lib/queue";
import { formatDuration } from "@/components/ui/Thumbnail";

type Hit = { saveId: string; snippet: string | null; start: number | null };

export function LibraryView() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { appearance } = useAppearance();
  const lib = useLibrary();

  const [space, setSpace] = useState<string | null>(params.get("space"));
  const [filter, setFilter] = useState<Filter>(isFilter(params.get("filter")) ? (params.get("filter") as Filter) : "all");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const inbox = lib.spaces.find((s) => s.kind === "inbox") ?? null;
  const inboxId = inbox?.id ?? null;
  const spacesById = useMemo(() => new Map(lib.spaces.map((s) => [s.id, s])), [lib.spaces]);
  const counts = useMemo(() => spaceCounts(lib.saves, inboxId), [lib.saves, inboxId]);
  const selectedId = space === "inbox" ? inboxId : space;
  const selected = selectedId ? spacesById.get(selectedId) : undefined;
  const visible = useMemo(
    () => filterSaves(lib.saves, { space: selectedId === inboxId && selectedId ? "inbox" : selectedId, filter, inboxId }),
    [lib.saves, selectedId, filter, inboxId],
  );
  const byId = useMemo(() => new Map(lib.saves.map((s) => [s.id, s])), [lib.saves]);

  // Shortcut "Search" opens with the field focused.
  useEffect(() => {
    if (params.get("search") === "1") searchRef.current?.focus();
  }, [params]);

  // Keep the selection in the URL so back and the Play button keep context.
  useEffect(() => {
    const q = new URLSearchParams();
    if (space) q.set("space", space);
    if (filter !== "all") q.set("filter", filter);
    const next = q.toString();
    if (next !== window.location.search.replace(/^\?/, "")) {
      window.history.replaceState(window.history.state, "", next ? `?${next}` : window.location.pathname);
    }
  }, [space, filter]);

  const playHref = (() => {
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
    setSearching(true);
    try {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, spaceId: selectedId }),
      });
      if (!r.ok) throw new Error();
      const json = (await r.json()) as { results: Hit[] };
      setHits(json.results);
    } catch {
      // Offline: search what's on the phone (captions and key ideas).
      const needle = q.toLowerCase();
      setHits(
        lib.saves
          .filter((s) => [s.keyIdea, s.aiTitle, s.caption, s.title, ...s.tags].some((t) => t?.toLowerCase().includes(needle)))
          .map((s) => ({ saveId: s.id, snippet: null, start: null })),
      );
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setHits(null);
  };

  const open = (s: SaveItem, t?: number | null) => router.push(t ? `/item/${s.id}?t=${Math.floor(t)}` : `/item/${s.id}`);

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
            <IconButton label="Save a link" icon={ClipboardPaste} onClick={() => setPasteOpen(true)} />
            {!empty && (
              <Link
                href={playHref}
                aria-label={selected ? `Play ${selected.name}` : "Play these saves"}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-fg active:scale-90"
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

      {empty ? (
        <EmptyState
          icon={Share2}
          message="Share a reel to Stash to start: in Instagram or TikTok tap Share, then Stash."
          actionLabel="Paste a link"
          actionIcon={ClipboardPaste}
          actionVariant="secondary"
          onAction={() => setPasteOpen(true)}
        />
      ) : (
        <>
          <div className="px-5">
            <SpacePicker
              spaces={lib.spaces}
              selectedId={selectedId}
              counts={counts}
              onPick={(id) => setSpace(id && id === inboxId ? "inbox" : id)}
              onCreate={newSpace}
              onLongPress={(id) => id !== inboxId && router.push(`/s/${id}`)}
            />
          </div>

          {selected && selected.kind !== "inbox" && (
            <Link href={`/s/${selected.id}`} className="mx-4 flex min-h-12 items-center gap-3 rounded-card bg-raised px-4 text-label text-fg">
              <span aria-hidden className={cx("h-2 w-2 rounded-full", SPACE_BG[selected.color])} />
              <span className="flex-1 truncate">Open {selected.name}</span>
              <ArrowRight size={24} strokeWidth={2} aria-hidden className="text-fg-muted" />
            </Link>
          )}

          <div className="scroll-area flex gap-1 overflow-x-auto px-4" role="group" aria-label="Filter">
            {FILTERS.map((f) => (
              <Chip key={f} label={FILTER_LABEL[f]} selected={filter === f} onClick={() => setFilter(f)} />
            ))}
          </div>

          {hits !== null ? (
            <section aria-label="Search results" className="flex flex-col gap-2 px-4">
              <div className="flex items-center justify-between">
                <h2 className="text-heading">
                  {searching ? "Searching…" : `${hitSaves.length} ${hitSaves.length === 1 ? "result" : "results"}`}
                </h2>
                {hitSaves.length > 0 && (
                  <Link
                    href={`/play?ids=${hitSaves.map((x) => x.hit.saveId).join(",")}`}
                    className="flex h-12 items-center gap-2 rounded-card px-3 text-label text-fg"
                  >
                    <Play size={20} strokeWidth={2} aria-hidden /> Play all
                  </Link>
                )}
              </div>
              <ul className="flex flex-col gap-2">
                {hitSaves.map(({ hit, save }) => (
                  <li key={hit.saveId}>
                    <button
                      type="button"
                      onClick={() => open(save!, hit.start)}
                      className="flex w-full gap-3 rounded-card bg-surface p-2 text-left"
                    >
                      <span className="relative h-24 w-16 shrink-0 overflow-hidden rounded-sm bg-raised">
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
                <p className="py-8 text-center text-body text-fg-muted">Nothing matches yet. Try other words.</p>
              )}
            </section>
          ) : lib.loading && lib.saves.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 px-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} shape="thumb" />
              ))}
            </div>
          ) : visible.length === 0 && (selectedId || filter !== "all") ? (
            <p className="px-6 py-12 text-center text-body text-fg-muted">Nothing here with this filter.</p>
          ) : (
            <SaveGrid
              items={visible}
              queued={!selectedId && filter === "all" ? lib.queued : []}
              thumbs={lib.thumbs}
              spacesById={spacesById}
              justReady={lib.justReady}
              density={appearance.density}
              onOpen={(s) => open(s)}
            />
          )}
        </>
      )}

      {!empty && (
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
          <div className="flex h-12 w-full items-center gap-2 rounded-full border border-line bg-surface pl-4 pr-1 shadow-raised">
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
          </div>
        </form>
      )}

      <PasteLinkSheet open={pasteOpen} onClose={() => setPasteOpen(false)} spaceId={selectedId === inboxId ? null : selectedId} onSaved={() => toast({ message: "Saved" })} />
    </div>
  );
}
