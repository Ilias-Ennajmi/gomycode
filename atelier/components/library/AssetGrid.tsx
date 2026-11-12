"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Copy, FolderInput, Film, Trash2 } from "lucide-react";
import { boardsLabel, formatBytes, type LibraryAsset } from "@/lib/assets/library-types";

export type AssetGridProps = {
  assets: LibraryAsset[];
  /** The small (w256) picture for a card; null shows a paper tile. */
  thumbUrl: (a: LibraryAsset) => string | null;
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  /** Called only for an asset no board uses. */
  onDelete: (a: LibraryAsset) => void;
  onAddToBoard: (a: LibraryAsset) => void;
  /** The "Possible duplicate" badge: take the owner to the groups. */
  onShowDuplicates?: (a: LibraryAsset) => void;
  boardHref: (boardId: string) => string;
};

const KIND_NAME = { image: "image", gif: "gif", video: "video" } as const;

/** What a card is called: its title, or "Untitled image" / "Untitled gif" / "Untitled video". Plain text, never markup. */
export const assetName = (a: LibraryAsset): string => a.title.trim() || `Untitled ${KIND_NAME[a.kind]}`;

const cardButton =
  "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-(length:--text-sm) font-medium text-fg transition-[transform,border-color] duration-(--dur-fast) ease-out active:scale-[0.97] pointer-coarse:min-h-11 hoverable:border-fg-muted";

function Card({ asset, p }: { asset: LibraryAsset; p: AssetGridProps }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const name = assetName(asset);
  const thumb = p.thumbUrl(asset);
  const inUse = asset.usedIn > 0;
  const more = asset.usedIn - asset.boards.length;
  const selected = p.selected.has(asset.id);
  return (
    <li className="min-w-0">
      <article
        aria-label={`${name}, ${KIND_NAME[asset.kind]}, ${asset.width} by ${asset.height}`}
        data-selected={selected || undefined}
        className={`group/card flex h-full flex-col rounded-lg border bg-panel p-2 ${selected ? "border-brand shadow-2" : "border-line"}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-canvas">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" className="h-full w-full object-contain" />
          ) : (
            <div aria-hidden="true" className="flex h-full w-full items-center justify-center text-fg-muted">
              {asset.kind === "video" ? <Film size={22} /> : null}
            </div>
          )}
          <label className="absolute left-1.5 top-1.5 inline-flex size-8 cursor-pointer items-center justify-center rounded-md bg-panel/90 shadow-1 pointer-coarse:size-11">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => p.onToggleSelect(asset.id)}
              aria-label={`Select ${name}`}
              className="size-4 accent-brand"
            />
          </label>
          {asset.kind !== "image" ? (
            <span className="absolute right-1.5 top-1.5 rounded-sm bg-panel/90 px-1.5 py-0.5 text-(length:--text-xs) font-medium uppercase shadow-1">{asset.kind}</span>
          ) : null}
        </div>

        <div className="mt-2 min-w-0 px-0.5">
          <p className="truncate font-medium" title={name}>
            {name}
          </p>
          <p className="text-(length:--text-sm) text-fg-muted">
            {asset.width} × {asset.height} · {formatBytes(asset.bytes)}
          </p>
          {inUse ? (
            <>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`${uid}-boards`}
                onClick={() => setOpen((o) => !o)}
                className="mt-1 inline-flex min-h-6 items-center gap-1 rounded-sm text-(length:--text-sm) text-fg underline-offset-2 hoverable:underline pointer-coarse:min-h-11"
              >
                {boardsLabel(asset.usedIn)}
                {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </button>
              {open ? (
                <ul id={`${uid}-boards`} className="mb-1 mt-0.5 flex flex-col gap-0.5 text-(length:--text-sm)">
                  {asset.boards.map((b) => (
                    <li key={b.id} className="min-w-0">
                      <Link href={p.boardHref(b.id)} className="inline-flex min-h-6 max-w-full items-center truncate rounded-sm text-brand underline underline-offset-2 pointer-coarse:min-h-11">
                        {b.title}
                      </Link>
                    </li>
                  ))}
                  {more > 0 ? <li className="text-fg-muted">and {more} more</li> : null}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-(length:--text-sm) text-fg-muted">{boardsLabel(0)}</p>
          )}
          {asset.similarTo.length > 0 ? (
            <button
              type="button"
              onClick={() => p.onShowDuplicates?.(asset)}
              className="mt-1 inline-flex min-h-6 items-center gap-1 rounded-sm border border-line px-1.5 text-(length:--text-xs) font-medium text-fg hoverable:border-fg-muted pointer-coarse:min-h-11"
            >
              <Copy size={12} aria-hidden="true" />
              Possible duplicate
            </button>
          ) : null}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <button type="button" className={cardButton} onClick={() => p.onAddToBoard(asset)}>
            <FolderInput size={14} aria-hidden="true" />
            Add to board
          </button>
          <button
            type="button"
            className={`${cardButton} ${inUse ? "opacity-60" : "hoverable:text-alert"}`}
            aria-disabled={inUse || undefined}
            aria-describedby={inUse ? `${uid}-why` : undefined}
            onClick={() => {
              if (!inUse) p.onDelete(asset);
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            Delete
            <span className="sr-only"> {name}</span>
          </button>
          {inUse ? (
            <span id={`${uid}-why`} className="w-full text-(length:--text-xs) text-fg-muted">
              {boardsLabel(asset.usedIn)}. Take it off those boards first.
            </span>
          ) : null}
        </div>
      </article>
    </li>
  );
}

/** The library's grid of assets: thumbnail, name, size, "Used in N boards", duplicate badge, and the card's actions. */
export function AssetGrid(props: AssetGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {props.assets.map((a) => (
        <Card key={a.id} asset={a} p={props} />
      ))}
    </ul>
  );
}
