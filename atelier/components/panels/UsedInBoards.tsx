"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { boardsLabel } from "@/lib/assets/library-types";

type Usage = { usedIn: number; boards: { id: string; title: string }[] };

const cache = new Map<string, Usage | null>();
/** Test hook: forget what was learned. */
export function resetUsedInBoardsCache(): void {
  cache.clear();
}

async function fetchUsage(assetId: string): Promise<Usage | null> {
  try {
    const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { usedIn?: unknown; boards?: unknown };
    if (typeof body.usedIn !== "number") return null;
    const boards = Array.isArray(body.boards) ? body.boards.filter((b): b is { id: string; title: string } => typeof b?.id === "string" && typeof b?.title === "string") : [];
    return { usedIn: body.usedIn, boards };
  } catch {
    return null;
  }
}

/**
 * Inspector line for one selected image: "Used in N boards" and the boards, from the asset library. Nothing is shown when
 * the server cannot say (offline, local-only mode, or the picture has not finished uploading). Mount it with `key={assetId}`.
 */
export function UsedInBoards({ assetId }: { assetId: string }) {
  const [usage, setUsage] = useState<{ id: string; value: Usage | null } | undefined>(() => (cache.has(assetId) ? { id: assetId, value: cache.get(assetId) ?? null } : undefined));
  useEffect(() => {
    if (cache.has(assetId)) return; // the initial state already has it
    let alive = true;
    void fetchUsage(assetId).then((value) => {
      cache.set(assetId, value);
      if (alive) setUsage({ id: assetId, value });
    });
    return () => {
      alive = false;
    };
  }, [assetId]);

  const value = usage?.id === assetId ? usage.value : null;
  if (!value) return null;
  return (
    <div className="grid gap-1 text-(length:--text-sm)">
      <p className="text-fg-muted">{boardsLabel(value.usedIn)}</p>
      {value.boards.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {value.boards.map((b) => (
            <li key={b.id} className="min-w-0">
              <Link href={`/b/${b.id}`} className="inline-flex min-h-(--target-min) max-w-full items-center truncate rounded-sm text-brand underline underline-offset-2">
                {b.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
