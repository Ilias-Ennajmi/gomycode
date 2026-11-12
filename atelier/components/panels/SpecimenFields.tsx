"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isValidFontName } from "@/lib/engine/fonts/font-loader";
import { searchFonts } from "@/lib/engine/fonts/popular-fonts";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import { oneStepOn } from "@/lib/engine/model/one-step";
import type { TypeSpecimenObj } from "@/lib/engine/model/types";
import { NumberField } from "./NumberField";

/** Typing in the family or sample field is written after this long without a keystroke. */
export const SPECIMEN_DEBOUNCE_MS = 500;
const SAMPLE_MAX = 500;

const WEIGHTS: { value: number; label: string }[] = [
  { value: 100, label: "100 Thin" },
  { value: 200, label: "200 Extra light" },
  { value: 300, label: "300 Light" },
  { value: 400, label: "400 Regular" },
  { value: 500, label: "500 Medium" },
  { value: 600, label: "600 Semi bold" },
  { value: 700, label: "700 Bold" },
  { value: 800, label: "800 Extra bold" },
  { value: 900, label: "900 Black" },
];

const isWebUrl = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const inputClass =
  "block min-h-(--target-min) w-full rounded-sm border border-line bg-panel px-2 text-(length:--text-sm) text-fg placeholder:text-fg-muted disabled:opacity-60 aria-[invalid=true]:border-(--color-danger)";
const labelClass = "w-14 shrink-0 text-(length:--text-xs) text-fg-muted";

/** A draft that is committed after a pause, on Enter / blur, or never when `valid` says no. */
function useDraft(value: string, commit: (v: string) => void, valid: (v: string) => boolean, delay: number | null) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ commit, valid, value });
  useEffect(() => {
    latest.current = { commit, valid, value };
  });
  const clear = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => clear, []);

  const flush = useCallback((v: string) => {
    clear();
    const cur = latest.current;
    if (cur.valid(v) && v !== cur.value) cur.commit(v);
  }, []);
  const change = (v: string) => {
    setDraft(v);
    clear();
    if (delay !== null) timer.current = setTimeout(() => flush(v), delay);
  };
  const end = () => {
    clear();
    setDraft(null);
  };
  return { shown: draft ?? value, draft, change, flush, end };
}

/**
 * Edit a type specimen: family (with suggestions from a bundled list, any other name can be typed), weight, italic,
 * sample text, size, licence note and source link. Used by the Inspector and by the selection bar's Type popover.
 * Every committed change is its own undo step; typing is written after a 500 ms pause or on Enter / blur, and only
 * when it is valid (a family name that could not go into a font URL, a source that is not an http(s) address).
 */
export function SpecimenFields({ obj, doc, disabled = false }: { obj: TypeSpecimenObj; doc: BoardDoc; disabled?: boolean }) {
  const set = useCallback((patch: Partial<TypeSpecimenObj>) => oneStepOn(doc, () => doc.update(obj.id, patch)), [doc, obj.id]);

  return (
    <div className="flex flex-col gap-2" data-specimen-fields="">
      <FamilyField value={obj.family} disabled={disabled} onCommit={(family) => set({ family })} />
      <div className="flex items-center gap-2">
        <label htmlFor={`${obj.id}-weight`} className={labelClass}>
          Weight
        </label>
        <select
          id={`${obj.id}-weight`}
          aria-label="Weight"
          disabled={disabled}
          value={obj.weight}
          onChange={(e) => set({ weight: Number(e.target.value) })}
          className={`${inputClass} flex-1`}
        >
          {WEIGHTS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={labelClass}>
          Style
        </span>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={obj.italic}
          disabled={disabled}
          onClick={() => set({ italic: !obj.italic })}
          className="inline-flex min-h-(--target-min) items-center rounded-sm border border-line px-3 text-(length:--text-sm) italic text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:opacity-60 aria-pressed:bg-(--color-selection-fill) hoverable:border-fg-muted"
        >
          Italic
        </button>
      </div>
      <NumberField label="Size" value={obj.size} unit="px" min={8} max={400} disabled={disabled} onCommit={(size) => set({ size })} />
      <SampleField value={obj.sample} disabled={disabled} onCommit={(sample) => set({ sample })} />
      <TextRow label="Licence note" short="Licence" value={obj.licenceNote} disabled={disabled} maxLength={500} onCommit={(licenceNote) => set({ licenceNote })} />
      <SourceField value={obj.sourceUrl} disabled={disabled} onCommit={(sourceUrl) => set({ sourceUrl })} />
    </div>
  );
}

function FamilyField({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const id = useId();
  const listId = `${id}-list`;
  const valid = (v: string) => isValidFontName(v);
  const f = useDraft(value, (v) => onCommit(v.trim().replace(/\s+/g, " ")), valid, SPECIMEN_DEBOUNCE_MS);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = open ? searchFonts(f.shown, 8) : [];
  const invalid = f.shown.trim() !== "" && !valid(f.shown);

  const pick = (name: string) => {
    f.flush(name);
    f.end();
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className={labelClass}>
          Family
        </label>
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            role="combobox"
            aria-label="Font family"
            aria-expanded={matches.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-err` : undefined}
            aria-activedescendant={active >= 0 && matches[active] ? `${id}-o${active}` : undefined}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={60}
            disabled={disabled}
            value={f.shown}
            onFocus={(e) => {
              e.currentTarget.select();
              setOpen(true);
            }}
            onChange={(e) => {
              f.change(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onBlur={() => {
              // A click on a suggestion lands before this (options use onMouseDown), so this only sees plain tabbing away.
              if (f.draft !== null) f.flush(f.draft);
              f.end();
              setOpen(false);
              setActive(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setOpen(true);
                const n = Math.max(1, matches.length || searchFonts(f.shown, 8).length);
                setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (active >= 0 && matches[active]) pick(matches[active]);
                else {
                  f.flush(f.shown);
                  setOpen(false);
                }
              } else if (e.key === "Escape") {
                if (open || f.draft !== null) {
                  e.preventDefault();
                  e.stopPropagation(); // close the list or cancel the edit, not the panel
                  setOpen(false);
                  f.end();
                }
              }
            }}
            className={inputClass}
          />
          {matches.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              aria-label="Font suggestions"
              className="absolute inset-x-0 top-full z-(--z-menu) mt-1 max-h-48 overflow-auto rounded-sm border border-line bg-panel py-1 shadow-2"
            >
              {matches.map((name, i) => (
                <li
                  key={name}
                  id={`${id}-o${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(name);
                  }}
                  className="min-h-(--target-min) cursor-pointer px-2 py-1 text-(length:--text-sm) text-fg aria-selected:bg-(--color-selection-fill) hoverable:bg-(--color-selection-fill)"
                >
                  {name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {invalid ? (
        <p id={`${id}-err`} className="pl-16 text-(length:--text-xs) text-(--color-danger)">
          Use letters, numbers, spaces and hyphens only (up to 60 characters).
        </p>
      ) : null}
    </div>
  );
}

function SampleField({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const id = useId();
  const f = useDraft(value, onCommit, () => true, SPECIMEN_DEBOUNCE_MS);
  return (
    <div className="flex items-start gap-2">
      <label htmlFor={id} className={`${labelClass} pt-1`}>
        Sample
      </label>
      <textarea
        id={id}
        aria-label="Sample text"
        rows={3}
        maxLength={SAMPLE_MAX}
        disabled={disabled}
        value={f.shown}
        onChange={(e) => f.change(e.target.value)}
        onBlur={() => {
          if (f.draft !== null) f.flush(f.draft);
          f.end();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && f.draft !== null) {
            e.preventDefault();
            e.stopPropagation();
            f.end();
          }
        }}
        className={`${inputClass} resize-y py-1`}
      />
    </div>
  );
}

/** A one-line text field committed on Enter or blur. */
function TextRow({
  label,
  short,
  value,
  disabled,
  maxLength,
  onCommit,
  validate = () => true,
  error,
  type = "text",
}: {
  label: string;
  short: string;
  value: string;
  disabled: boolean;
  maxLength: number;
  onCommit: (v: string) => void;
  validate?: (v: string) => boolean;
  error?: string;
  type?: "text" | "url";
}) {
  const id = useId();
  const ok = (v: string) => v === "" || validate(v);
  const f = useDraft(value, (v) => onCommit(v.trim()), ok, null);
  const invalid = f.draft !== null && f.draft.trim() !== "" && !validate(f.draft.trim());
  const settle = () => {
    if (f.draft === null) return;
    const v = f.draft.trim();
    // A valid value (or empty, which clears the field) is written; an invalid one stays on screen with its message.
    if (ok(v)) {
      f.flush(v);
      f.end();
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className={labelClass}>
          {short}
        </label>
        <input
          id={id}
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-err` : undefined}
          type="text"
          inputMode={type === "url" ? "url" : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          disabled={disabled}
          value={f.shown}
          onChange={(e) => f.change(e.target.value)}
          onBlur={settle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              settle();
            } else if (e.key === "Escape" && f.draft !== null) {
              e.preventDefault();
              e.stopPropagation();
              f.end();
            }
          }}
          className={inputClass}
        />
      </div>
      {invalid && error ? (
        <p id={`${id}-err`} className="pl-16 text-(length:--text-xs) text-(--color-danger)">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SourceField({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <TextRow
        label="Source URL"
        short="Source"
        type="url"
        value={value}
        disabled={disabled}
        maxLength={2000}
        validate={isWebUrl}
        error="Enter a web address starting with http:// or https://"
        onCommit={onCommit}
      />
      {value && isWebUrl(value) ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="pl-16 text-(length:--text-xs) text-(--color-accent) underline">
          Open source
        </a>
      ) : null}
    </div>
  );
}
