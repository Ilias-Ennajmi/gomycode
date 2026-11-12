"use client";

import { useId } from "react";
import { Trash2 } from "lucide-react";
import { boardsLabel, formatBytes, type DuplicateGroup, type LibraryAsset } from "@/lib/assets/library-types";
import { assetName } from "./AssetGrid";

const pixels = (a: LibraryAsset) => a.width * a.height;

/**
 * The members of a duplicate group that "Delete unused copies" may remove. A member a board uses is never included. When
 * nothing in the group is in use one copy is kept (the biggest picture, then the oldest, then the lowest id), so deleting
 * the unused copies can never delete every copy of a picture.
 */
export function unusedCopies(members: LibraryAsset[]): LibraryAsset[] {
  if (members.length < 2) return [];
  const unused = members.filter((m) => m.usedIn === 0);
  if (unused.length < members.length) return unused;
  const keep = [...unused].sort((a, b) => pixels(b) - pixels(a) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) || (a.id < b.id ? -1 : 1))[0];
  return unused.filter((m) => m !== keep);
}

/** Each group of near-identical pictures side by side, with sizes, where each is used, and "Delete unused copies". */
export function DuplicateGroups({
  groups,
  assets,
  thumbUrl,
  onDeleteUnused,
}: {
  groups: DuplicateGroup[];
  assets: LibraryAsset[];
  thumbUrl: (a: LibraryAsset) => string | null;
  onDeleteUnused: (copies: LibraryAsset[], group: DuplicateGroup) => void;
}) {
  const uid = useId();
  const byId = new Map(assets.map((a) => [a.id, a]));
  const shown = groups
    .map((g) => ({ g, members: g.assetIds.map((i) => byId.get(i)).filter((a): a is LibraryAsset => Boolean(a)) }))
    .filter((x) => x.members.length >= 2);
  if (shown.length === 0) return <p className="text-fg-muted">No duplicates found. Pictures that look almost the same will be grouped here.</p>;

  return (
    <div className="flex flex-col gap-6">
      {shown.map(({ g, members }, index) => {
        const copies = unusedCopies(members);
        return (
          <section key={g.assetIds.join(",")} role="group" aria-labelledby={`${uid}-${index}`} className="rounded-lg border border-line bg-panel p-4">
            <h3 id={`${uid}-${index}`} className="text-(length:--text-md) font-semibold">
              Duplicate group {index + 1}
              <span className="ml-2 text-(length:--text-sm) font-normal text-fg-muted">{g.dist === 0 ? "look identical" : "look very similar"}</span>
            </h3>
            <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {members.map((m) => {
                const url = thumbUrl(m);
                return (
                  <li key={m.id} className="min-w-0">
                    <div className="aspect-[4/3] overflow-hidden rounded-md border border-line bg-canvas">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" className="h-full w-full object-contain" />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate font-medium" title={assetName(m)}>
                      {assetName(m)}
                    </p>
                    <p className="text-(length:--text-sm) text-fg-muted">
                      {m.width} × {m.height} · {formatBytes(m.bytes)}
                    </p>
                    <p className="text-(length:--text-sm) text-fg-muted">{boardsLabel(m.usedIn)}</p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              {copies.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onDeleteUnused(copies, g)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-panel px-4 text-(length:--text-md) font-medium text-fg transition-[transform,border-color] duration-(--dur-fast) ease-out active:scale-[0.97] hoverable:border-fg-muted"
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {`Delete ${copies.length} unused ${copies.length === 1 ? "copy" : "copies"}`}
                </button>
              ) : (
                <p className="text-(length:--text-sm) text-fg-muted">Every copy is on a board, so nothing here can be deleted yet.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
