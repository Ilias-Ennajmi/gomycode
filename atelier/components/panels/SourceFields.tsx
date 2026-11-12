"use client";

import { ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { assetHasProvenance as defaultHas, patchAssetProvenance } from "@/lib/assets/provenance-client";
import { getAssetMetaStore, type AssetMetaStore } from "@/lib/assets/meta-store";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { ImageObj, Provenance, VideoObj } from "@/lib/engine/model/types";
import { saveProvenance } from "@/lib/engine/provenance/save";
import { emptyProvenance, LICENCE_SUGGESTIONS, MAX_CREDIT, MAX_LICENCE, sanitizeSourceUrl, validateProvenance } from "@/lib/engine/provenance/validate";

const inputClass =
  "block min-h-(--target-min) w-full min-w-0 rounded-sm border border-line bg-panel px-2 text-(length:--text-sm) text-fg placeholder:text-fg-muted disabled:opacity-60 aria-[invalid=true]:border-alert";
const labelClass = "text-(length:--text-xs) text-fg-muted";

type Key = "sourceUrl" | "credit" | "licence";

const MESSAGES: Record<Key, string> = {
  sourceUrl: "Use a web address that starts with http:// or https://, without a username or password.",
  credit: `Keep the credit under ${MAX_CREDIT} characters.`,
  licence: `Keep the licence under ${MAX_LICENCE} characters.`,
};

export type SourceFieldsProps = {
  obj: ImageObj | VideoObj;
  doc: BoardDoc;
  disabled?: boolean;
  /** Test seams: default to the real server call and the device's asset metadata. */
  patchAsset?: (assetId: string, p: Provenance) => Promise<void>;
  assetHasProvenance?: (assetId: string) => boolean;
  meta?: AssetMetaStore;
};

/**
 * Where a picture or video came from: source link, credit, licence and capture date. Used by the Inspector's Source
 * section and the selection bar's Source popover. Typing is a draft; Enter or leaving a field saves it (one undo step),
 * and only when the whole record is valid: a link must be http(s) with no credentials, credit and licence have length
 * limits. The object holds the record; the asset is told once, the first time it gets any.
 */
export function SourceFields({ obj, doc, disabled = false, patchAsset, assetHasProvenance, meta }: SourceFieldsProps) {
  const ids = useId();
  const { toast } = useEditor();
  const store = meta ?? getAssetMetaStore();
  const current: Provenance = obj.provenance ?? emptyProvenance();
  // Handlers read the document at commit time, not the last render: two quick edits must not overwrite each other.
  const latest = (): Provenance => {
    const o = doc.get(obj.id);
    return (o && (o.type === "image" || o.type === "video") ? o.provenance : null) ?? emptyProvenance();
  };
  const [drafts, setDrafts] = useState<Partial<Record<Key, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<Key, true>>>({});

  const save = (next: Provenance): boolean =>
    saveProvenance(doc, obj.id, next, {
      patchAsset: patchAsset ?? ((id, p) => patchAssetProvenance(id, p, { meta: store })),
      assetHasProvenance: assetHasProvenance ?? ((id) => defaultHas(id, store)),
    });

  const commit = (key: Key, raw: string) => {
    const value = raw.trim();
    const base = latest();
    const candidate: Provenance = { ...base, [key]: key === "sourceUrl" ? (value === "" ? null : value) : value };
    const clean = validateProvenance(candidate);
    if (!clean) {
      setErrors((e) => ({ ...e, [key]: true }));
      return;
    }
    setErrors((e) => {
      const { [key]: _gone, ...rest } = e;
      void _gone;
      return rest;
    });
    setDrafts((d) => {
      const { [key]: _gone, ...rest } = d;
      void _gone;
      return rest;
    });
    if (clean.sourceUrl === base.sourceUrl && clean.credit === base.credit && clean.licence === base.licence) return;
    if (!save(clean)) toast({ message: "Couldn't save that source" });
  };

  const field = (key: Key, label: string, props: { placeholder?: string; maxLength?: number; list?: string; inputMode?: "url"; role?: string }) => {
    const shown = drafts[key] ?? (key === "sourceUrl" ? (current.sourceUrl ?? "") : current[key]);
    const id = `${ids}-${key}`;
    return (
      <div className="grid gap-1">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <input
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={shown}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          list={props.list}
          inputMode={props.inputMode}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={errors[key] ? `${id}-error` : undefined}
          onChange={(e) => {
            setDrafts((d) => ({ ...d, [key]: e.target.value }));
            if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }) as typeof x);
          }}
          onBlur={(e) => {
            if (drafts[key] !== undefined) commit(key, e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(key, e.currentTarget.value);
            } else if (e.key === "Escape" && drafts[key] !== undefined) {
              e.stopPropagation();
              setDrafts(({ [key]: _gone, ...rest }) => {
                void _gone;
                return rest;
              });
              setErrors(({ [key]: _gone, ...rest }) => {
                void _gone;
                return rest;
              });
            }
          }}
          className={inputClass}
        />
        {errors[key] ? (
          <p id={`${id}-error`} role="alert" className="text-(length:--text-xs) text-alert">
            {MESSAGES[key]}
          </p>
        ) : null}
      </div>
    );
  };

  const link = current.sourceUrl ? sanitizeSourceUrl(current.sourceUrl) : null;

  return (
    <div className="grid gap-2" data-source-fields="">
      {field("sourceUrl", "Source URL", { placeholder: "https://", maxLength: 2100, inputMode: "url" })}
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex min-h-(--target-min) w-fit items-center gap-1 text-(length:--text-xs) text-select underline underline-offset-2"
        >
          <ExternalLink aria-hidden="true" size={14} />
          <span>Open source</span>
        </a>
      ) : null}
      {field("credit", "Credit", { placeholder: "Photographer or studio", maxLength: MAX_CREDIT })}
      {field("licence", "Licence", { placeholder: "e.g. CC BY 4.0", maxLength: MAX_LICENCE, list: `${ids}-licences` })}
      <datalist id={`${ids}-licences`}>
        {LICENCE_SUGGESTIONS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <div className="grid gap-1">
        <label htmlFor={`${ids}-captured`} className={labelClass}>
          Captured
        </label>
        <input
          id={`${ids}-captured`}
          type="date"
          disabled={disabled}
          value={current.capturedAt ? current.capturedAt.slice(0, 10) : ""}
          onChange={(e) => {
            const v = e.target.value;
            const clean = validateProvenance({ ...latest(), capturedAt: v === "" ? null : v });
            if (clean && !save(clean)) toast({ message: "Couldn't save that date" });
          }}
          className={inputClass}
        />
      </div>
    </div>
  );
}
