"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { buttonSecondary, inputClass, labelClass } from "@/components/ui/controls";
import { Dialog } from "@/components/home/Dialog";

export type PickableBoard = { id: string; title: string };

/** Which boards "Add to board" can target: the owner's boards (signed in) or this device's (local-only), never the trash. */
export async function loadPickableBoards(localOnly: boolean, fetchFn?: typeof fetch): Promise<PickableBoard[]> {
  const f = fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  if (!localOnly) {
    try {
      const res = await f("/api/boards", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { boards?: { id: string; title: string; updatedAt?: string; lastOpenedAt?: string | null }[] };
        if (Array.isArray(body.boards)) return recent(body.boards);
      }
    } catch {
      /* offline: fall back to the list this device last saw */
    }
  }
  const { readBoardList } = await import("@/lib/sync/board-list-cache");
  return recent((await readBoardList()).boards);
}

const stamp = (b: { updatedAt?: string; lastOpenedAt?: string | null }) => Math.max(Date.parse(b.updatedAt ?? "") || 0, Date.parse(b.lastOpenedAt ?? "") || 0);
const recent = (boards: { id: string; title: string; updatedAt?: string; lastOpenedAt?: string | null }[]): PickableBoard[] =>
  [...boards].sort((a, b) => stamp(b) - stamp(a)).map((b) => ({ id: b.id, title: b.title || "Untitled" }));

/** A dialog that lists the boards and calls `onPick` with the chosen one. */
export function BoardPicker({
  heading = "Add to which board?",
  load,
  onPick,
  onClose,
}: {
  heading?: string;
  load: () => Promise<PickableBoard[]>;
  onPick: (board: PickableBoard) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [boards, setBoards] = useState<PickableBoard[] | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let alive = true;
    void load().then((b) => alive && setBoards(b));
    return () => {
      alive = false;
    };
  }, [load]);
  const shown = useMemo(() => (boards ?? []).filter((b) => b.title.toLowerCase().includes(query.trim().toLowerCase())), [boards, query]);

  return (
    <Dialog labelledBy={`${id}-h`} onClose={onClose}>
      <h2 id={`${id}-h`} className="mb-4 text-(length:--text-lg) font-semibold">
        {heading}
      </h2>
      <label htmlFor={`${id}-q`} className={labelClass}>
        Search boards
      </label>
      <input id={`${id}-q`} type="search" className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      <div className="mt-3 max-h-64 overflow-y-auto" aria-live="polite">
        {boards === null ? (
          <p className="py-3 text-fg-muted">Loading your boards…</p>
        ) : shown.length === 0 ? (
          <p className="py-3 text-fg-muted">{boards.length === 0 ? "You have no boards yet. Create one from the home screen." : "No board has that name."}</p>
        ) : (
          <ul className="flex flex-col">
            {shown.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onPick(b)}
                  className="flex min-h-11 w-full items-center rounded-md px-3 text-left transition-colors duration-(--dur-fast) ease-out hoverable:bg-line"
                >
                  <span className="truncate">{b.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
