"use client";

import { Copy, Lock, LockOpen, Pipette, SquarePlus, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast as defaultToast } from "@/components/chrome/Toast";
import { useEditor } from "@/components/editor/EditorContext";
import { getAssetMetaStore, type AssetMetaStore } from "@/lib/assets/meta-store";
import { downloadBlob } from "@/lib/download";
import { aggregatePalette } from "@/lib/engine/color/aggregate";
import { copyColorValue } from "@/lib/engine/color/copy";
import { eyeDropperAvailable, pickScreenColor } from "@/lib/engine/color/eyedropper";
import { getHighlightStore } from "@/lib/engine/color/highlight";
import { addLockedSwatch, createPalette, patchPaletteSwatch, pullOutSwatch, removePaletteSwatch, toggleSwatchLock } from "@/lib/engine/color/palette-ops";
import { viewCentre } from "@/lib/engine/commands/media-commands";
import { exportPalette, PALETTE_FORMATS } from "@/lib/engine/export/palette-formats";
import { normalizeHex } from "@/lib/engine/model/color";
import { oneStepOn } from "@/lib/engine/model/one-step";
import type { PaletteObj, PaletteSwatch } from "@/lib/engine/model/types";
import { useDocTick, useSelectionIds } from "./doc-hooks";
import { NumberField } from "./NumberField";

const pct = (w: number) => `${Math.round(Math.min(1, Math.max(0, w)) * 100)}%`;

const iconButton =
  "inline-flex size-(--target-min) shrink-0 items-center justify-center rounded-sm text-fg-muted transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] pointer-coarse:size-(--target-coarse) hoverable:bg-(--color-selection-fill) hoverable:text-fg aria-pressed:bg-(--color-selection-fill) aria-pressed:text-fg disabled:opacity-40";
const actionButton =
  "inline-flex min-h-(--target-min) items-center gap-2 rounded-sm border border-line px-2 text-(length:--text-sm) text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:opacity-60 aria-pressed:bg-(--color-selection-fill) hoverable:border-fg-muted";
const switchButton =
  "inline-flex min-h-(--target-min) w-full items-center justify-between gap-2 rounded-sm border border-line px-2 text-left text-(length:--text-sm) text-fg transition-[transform,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] aria-checked:bg-(--color-selection-fill) hoverable:border-fg-muted";

/** The highlighted colour, live. */
function useHighlight(): string | null {
  const store = getHighlightStore();
  return useSyncExternalStore(store.subscribe, () => store.hex, () => null);
}

/** Name field of one row: typing is a draft, Enter or leaving the field commits it, Escape puts the old name back. */
function NameField({ hex, value, disabled, onCommit }: { hex: string; value: string; disabled: boolean; onCommit(name: string): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = () => {
    if (draft !== null && draft.trim() !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      type="text"
      aria-label={`Name of ${hex}`}
      placeholder="Name"
      maxLength={100}
      disabled={disabled}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          done();
        } else if (e.key === "Escape" && draft !== null) {
          e.stopPropagation();
          setDraft(null);
        }
      }}
      className="block min-h-(--target-min) w-full min-w-0 rounded-sm border border-line bg-panel px-2 text-(length:--text-sm) text-fg placeholder:text-fg-muted disabled:opacity-60"
    />
  );
}

/**
 * The Palette panel: the colours of the board (or of the palette object you selected) with their share, a click-to-highlight
 * on every colour, name and lock to keep one for good, copy, pull out as a colour card, a way to add a colour you can see
 * (the screen picker where the browser has one, a hex field everywhere), and export to Adobe, Procreate, CSS, Tailwind and
 * JSON. With no palette object on the board it shows the board's colours live and offers to add one.
 */
export function PalettePanel({ meta: metaProp, toast: toastProp }: { meta?: AssetMetaStore; toast?: typeof defaultToast } = {}) {
  const { handle, commandCtx, toast: editorToast } = useEditor();
  const toast = toastProp ?? editorToast;
  const { doc, selection } = handle;
  const meta = metaProp ?? getAssetMetaStore();
  const selected = useSelectionIds(selection);
  const docTick = useDocTick(doc);
  const [metaTick, setMetaTick] = useState(0);
  useEffect(() => meta.subscribe(() => setMetaTick((t) => t + 1)), [meta]);
  const highlight = useHighlight();
  const [chosen, setChosen] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState("");
  const [hexError, setHexError] = useState(false);

  // The highlight belongs to the open panel.
  useEffect(() => () => getHighlightStore().set(null), []);

  const { palettes, current, preview } = useMemo(() => {
    void docTick;
    void metaTick;
    const all = doc.all();
    const palettes = all.filter((o): o is PaletteObj => o.type === "palette");
    const sel = [...selected].map((id) => doc.get(id)).filter((o): o is PaletteObj => o?.type === "palette");
    const current = (sel.length === 1 ? sel[0] : null) ?? palettes.find((p) => p.id === chosen) ?? palettes[0] ?? null;
    let preview: PaletteSwatch[] = [];
    if (!current) {
      const inputs = [];
      for (const o of all) {
        if (o.type !== "image") continue;
        const palette = meta.get(o.assetId)?.palette;
        if (palette) inputs.push({ palette, area: o.w * o.h });
      }
      preview = aggregatePalette(inputs, { maxColors: 8, locked: [] });
    }
    return { palettes, current, preview };
  }, [doc, docTick, metaTick, selected, chosen, meta]);

  const swatches = current ? current.swatches : preview;
  const editable = !!current && !current.locked;
  const at = () => viewCentre(commandCtx());

  const addHex = (hexInput: string): boolean => {
    const hex = normalizeHex(hexInput.trim());
    if (!hex) return false;
    if (current) {
      addLockedSwatch(doc, current.id, hex);
    } else {
      const id = createPalette(doc, at(), { live: true, swatches: [{ hex, weight: 0, name: "", locked: true }] });
      selection.set([id]);
    }
    return true;
  };

  const doExport = (format: (typeof PALETTE_FORMATS)[number]["id"]) => {
    const title = doc.meta.title.trim();
    const r = exportPalette(format, swatches, { name: title || "palette", boardTitle: title });
    try {
      downloadBlob(r.filename, r.bytes, r.mime);
      toast({ message: `Exported ${r.filename}${r.skipped ? ` (${r.skipped} skipped: not a colour)` : ""}` });
    } catch {
      toast({ message: "Couldn't create that file" });
    }
  };

  const set = (patch: Partial<PaletteObj>) => {
    if (current && editable) oneStepOn(doc, () => doc.update(current.id, patch));
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 outline-none" data-palette-panel="" data-autofocus="" tabIndex={-1}>
      {palettes.length > 1 ? (
        <label className="flex items-center gap-2 text-(length:--text-xs) text-fg-muted">
          <span className="w-14 shrink-0">Palette</span>
          <select
            aria-label="Palette on the board"
            value={current?.id ?? ""}
            onChange={(e) => {
              setChosen(e.target.value);
              selection.set([e.target.value]);
            }}
            className="block min-h-(--target-min) w-full rounded-sm border border-line bg-panel px-2 text-(length:--text-sm) text-fg"
          >
            {palettes.map((p, i) => (
              <option key={p.id} value={p.id}>
                {`Palette ${i + 1}${p.live ? " (live)" : ""}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section aria-label="Colours" className="grid gap-2">
        <p className="text-(length:--text-xs) font-medium text-fg-muted">{current ? (current.live ? "Colours on the board, live" : "Colours") : "Colours on the board"}</p>
        {swatches.length === 0 ? (
          <p className="text-(length:--text-sm) text-fg-muted">No colours yet. Add images to the board and their colours appear here.</p>
        ) : (
          <ul className="grid gap-2">
            {swatches.map((s) => {
              const pressed = highlight !== null && highlight === s.hex;
              const kept = s.locked || s.name.trim() !== "";
              return (
                <li key={s.hex} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-line p-2">
                  <button
                    type="button"
                    data-highlight-chip=""
                    aria-pressed={pressed}
                    aria-label={`Highlight ${s.hex} on the board`}
                    onClick={() => getHighlightStore().toggle(s.hex)}
                    className="size-8 shrink-0 rounded-sm border border-line transition-transform duration-(--dur-fast) ease-out active:scale-[0.97] pointer-coarse:size-11 aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-(--color-selection)"
                    style={{ background: s.hex }}
                  />
                  <div className="grid min-w-32 flex-1 gap-1">
                    <NameField hex={s.hex} value={s.name} disabled={!editable} onCommit={(name) => patchPaletteSwatch(doc, current!.id, s.hex, { name })} />
                    <div className="flex items-center gap-2 text-(length:--text-xs) text-fg-muted">
                      <span className="tabular-nums text-fg">{s.hex}</span>
                      <span aria-hidden="true" className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-line">
                        <span data-testid="weight-bar" className="block h-full" style={{ width: pct(s.weight), background: s.hex }} />
                      </span>
                      <span className="w-9 text-right tabular-nums">{pct(s.weight)}</span>
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center">
                    <button
                      type="button"
                      aria-pressed={s.locked}
                      aria-label={`Lock ${s.hex}`}
                      title={s.locked ? "Locked: stays when the pictures change" : "Lock so it stays when the pictures change"}
                      disabled={!editable}
                      onClick={() => toggleSwatchLock(doc, current!.id, s.hex)}
                      className={iconButton}
                    >
                      {s.locked ? <Lock aria-hidden="true" size={16} /> : <LockOpen aria-hidden="true" size={16} />}
                    </button>
                    <button type="button" aria-label={`Copy ${s.hex}`} title="Copy hex" onClick={() => void copyColorValue(s.hex, toast)} className={iconButton}>
                      <Copy aria-hidden="true" size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Pull out ${s.hex} as a swatch card`}
                      title="Pull out as a swatch card"
                      onClick={() => selection.set([pullOutSwatch(doc, current?.id ?? null, s, at())])}
                      className={iconButton}
                    >
                      <SquarePlus aria-hidden="true" size={16} />
                    </button>
                    {editable && kept ? (
                      <button type="button" aria-label={`Remove ${s.hex}`} title="Remove from the palette" onClick={() => removePaletteSwatch(doc, current!.id, s.hex)} className={iconButton}>
                        <X aria-hidden="true" size={16} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={actionButton}
            onClick={() => selection.set([createPalette(doc, at(), { live: true })])}
          >
            Add palette to board
          </button>
        </div>
      </section>

      <section aria-label="Export" className="grid gap-2">
        <button type="button" aria-expanded={exportOpen} aria-controls="palette-export-list" disabled={swatches.length === 0} onClick={() => setExportOpen((o) => !o)} className={`${actionButton} w-fit`}>
          Export
        </button>
        {exportOpen && swatches.length > 0 ? (
          <div id="palette-export-list" className="grid gap-2">
            <ul className="grid gap-1">
              {PALETTE_FORMATS.map((f) => (
                <li key={f.id}>
                  <button type="button" data-format={f.id} className={`${actionButton} w-full`} onClick={() => doExport(f.id)}>
                    Export {f.label}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-(length:--text-xs) text-fg-muted">
              Open them once in Adobe apps or Procreate to check the colours arrived as intended. The files follow each app&apos;s published format but are not tested in those apps from here.
            </p>
          </div>
        ) : null}
      </section>

      <section aria-label="Add a colour" className="grid gap-2 border-t border-line pt-3">
        <p className="text-(length:--text-xs) font-medium text-fg-muted">Add a colour</p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const ok = addHex(hexDraft);
            setHexError(!ok);
            if (ok) setHexDraft("");
          }}
        >
          <input
            type="text"
            aria-label="Hex colour"
            aria-invalid={hexError || undefined}
            placeholder="#2f4a6d"
            spellCheck={false}
            autoComplete="off"
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value);
              setHexError(false);
            }}
            className="block min-h-(--target-min) w-32 rounded-sm border border-line bg-panel px-2 text-(length:--text-sm) text-fg tabular-nums placeholder:text-fg-muted aria-[invalid=true]:border-alert"
          />
          <button type="submit" className={actionButton}>
            Add colour
          </button>
          {eyeDropperAvailable() ? (
            <button
              type="button"
              className={actionButton}
              onClick={() =>
                void pickScreenColor().then((hex) => {
                  if (hex) addHex(hex);
                })
              }
            >
              <Pipette aria-hidden="true" size={16} />
              <span>Pick from screen</span>
            </button>
          ) : null}
        </form>
        {hexError ? <p role="alert" className="text-(length:--text-xs) text-alert">That is not a colour. Use a hex value such as #2f4a6d.</p> : null}
      </section>

      {current ? (
        <section aria-label="Palette settings" className="grid gap-2 border-t border-line pt-3">
          <p className="text-(length:--text-xs) font-medium text-fg-muted">This palette</p>
          <button type="button" role="switch" aria-label="Live palette" aria-checked={current.live} disabled={!editable} onClick={() => set({ live: !current.live })} className={switchButton}>
            <span>Live: follows the pictures</span>
            <span className="text-(length:--text-xs) text-fg-muted">{current.live ? "On" : "Off"}</span>
          </button>
          <NumberField label="Max colours" value={current.maxColors} min={3} max={12} disabled={!editable} onCommit={(v) => set({ maxColors: Math.round(v) })} />
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={current.layout === "strip"} aria-label="Strip layout" disabled={!editable} className={actionButton} onClick={() => set({ layout: "strip" })}>
              Strip
            </button>
            <button type="button" aria-pressed={current.layout === "grid"} aria-label="Grid layout" disabled={!editable} className={actionButton} onClick={() => set({ layout: "grid" })}>
              Grid
            </button>
          </div>
          <button type="button" role="switch" aria-label="Show percentages" aria-checked={current.showWeights} disabled={!editable} onClick={() => set({ showWeights: !current.showWeights })} className={switchButton}>
            <span>Show percentages</span>
            <span className="text-(length:--text-xs) text-fg-muted">{current.showWeights ? "On" : "Off"}</span>
          </button>
        </section>
      ) : null}

    </div>
  );
}
