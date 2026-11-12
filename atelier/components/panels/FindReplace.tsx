"use client";

import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { cameraToReveal } from "@/lib/engine/commands/focus";
import { boundsOf } from "@/lib/engine/geometry/rect";
import { undoIfLatest } from "@/lib/engine/model/one-step";
import { replaceAll, searchBoard } from "@/lib/engine/model/search";
import { useDocTick } from "./doc-hooks";
import { layerName } from "./layers-model";

const iconButton =
  "inline-flex size-(--target-min) shrink-0 items-center justify-center rounded-sm border border-line text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 hoverable:border-fg-muted";
const inputClass =
  "block min-h-(--target-min) w-full rounded-sm border border-line bg-panel px-2 text-(length:--text-sm) text-fg placeholder:text-fg-muted";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Find and replace across text, stickies, shape and arrow labels and frame names. */
export function FindReplace() {
  const { handle, toast } = useEditor();
  const { doc, selection } = handle;
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [current, setCurrent] = useState(-1);
  const findRef = useRef<HTMLInputElement>(null);
  const ids = { find: useId(), replace: useId(), summary: useId() };

  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
  }, []);

  const tick = useDocTick(doc);
  const hits = useMemo(() => {
    void tick;
    return searchBoard(doc, query, { caseSensitive, wholeWord });
  }, [doc, query, caseSensitive, wholeWord, tick]);
  const total = hits.reduce((n, h) => n + h.matches, 0);

  const summary = query.trim() === "" ? "" : hits.length === 0 ? "No matches" : `${plural(total, "match", "matches")} in ${plural(hits.length, "object", "objects")}`;

  const go = (index: number, animate: boolean) => {
    const hit = hits[index];
    const o = hit && doc.get(hit.id);
    if (!hit || !o) return;
    setCurrent(index);
    selection.set([hit.id]);
    const cam = cameraToReveal(handle.getCamera(), handle.viewport(), boundsOf(o));
    if (cam) handle.setCamera(cam, { animate });
  };
  const step = (dir: 1 | -1, animate: boolean) => {
    if (hits.length === 0) return;
    const base = current < 0 ? (dir === 1 ? -1 : 0) : current;
    go((base + dir + hits.length) % hits.length, animate);
  };

  const doReplace = () => {
    doc.stopCapturing();
    const n = replaceAll(doc, query, replacement, { caseSensitive, wholeWord });
    if (n === 0) return;
    const stack = doc.undoManager.undoStack;
    const mine = stack[stack.length - 1];
    toast({
      message: `Replaced ${plural(n, "match", "matches")}`,
      action: { label: "Undo", run: () => void undoIfLatest(doc, mine) },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 py-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={ids.find} className="mb-1 block text-(length:--text-xs) text-fg-muted">
            Find
          </label>
          <div className="relative">
            <Search aria-hidden="true" size={14} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg-muted" />
            <input
              ref={findRef}
              id={ids.find}
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              aria-describedby={ids.summary}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrent(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  step(e.shiftKey ? -1 : 1, false); // keyboard: the camera jumps, it never animates
                }
              }}
              className={`${inputClass} pl-7`}
            />
          </div>
        </div>
        <button type="button" aria-label="Previous match" className={iconButton} disabled={hits.length === 0} onClick={() => step(-1, true)}>
          <ChevronUp aria-hidden="true" size={16} />
        </button>
        <button type="button" aria-label="Next match" className={iconButton} disabled={hits.length === 0} onClick={() => step(1, true)}>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      </div>

      <div>
        <label htmlFor={ids.replace} className="mb-1 block text-(length:--text-xs) text-fg-muted">
          Replace with
        </label>
        <input
          id={ids.replace}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-(length:--text-sm) text-fg">
        <label className="inline-flex min-h-(--target-min) items-center gap-2">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="size-4 accent-(--color-accent)" />
          Match case
        </label>
        <label className="inline-flex min-h-(--target-min) items-center gap-2">
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} className="size-4 accent-(--color-accent)" />
          Whole word
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p id={ids.summary} role="status" className="min-h-5 text-(length:--text-sm) text-fg-muted">
          {summary}
        </p>
        <button
          type="button"
          disabled={hits.length === 0}
          onClick={doReplace}
          className="inline-flex min-h-(--target-min) items-center justify-center rounded-sm bg-brand px-3 text-(length:--text-sm) font-medium text-on-brand transition-[transform,opacity] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 hoverable:opacity-90"
        >
          Replace all
        </button>
      </div>

      <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto">
        {hits.map((h, i) => {
          const o = doc.get(h.id);
          if (!o) return null;
          const name = layerName(doc, o);
          return (
            <li key={h.id}>
              <button
                type="button"
                aria-current={i === current ? "true" : undefined}
                onClick={() => go(i, true)}
                className={`flex min-h-(--target-min) w-full items-center gap-2 rounded-sm px-2 text-left text-(length:--text-sm) text-fg hoverable:bg-(--color-selection-fill) ${i === current ? "bg-(--color-selection-fill)" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 text-(length:--text-xs) text-fg-muted">{h.matches > 1 ? `${h.matches} matches` : h.field === "frameName" ? "frame name" : h.field}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
