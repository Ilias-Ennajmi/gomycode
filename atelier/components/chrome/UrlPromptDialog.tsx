"use client";

import { useId, useState, type FormEvent } from "react";
import { Dialog } from "@/components/home/Dialog";
import { validateUrlInput } from "@/lib/engine/links/url-input";
import { buttonPrimary, buttonSecondary, errorClass, helpClass, inputClass, labelClass } from "@/components/ui/controls";

const COPY = {
  link: { title: "Add a link card", hint: "Paste the address of any web page.", action: "Add link" },
  embed: { title: "Embed a video or design", hint: "A YouTube, Vimeo or Figma address. It loads only when you press Play.", action: "Add embed" },
} as const;

/**
 * A small native <dialog> that asks for one web address. Validation messages appear under the field (and are announced);
 * nothing is added until the address passes the same checks as pasting it.
 */
export function UrlPromptDialog({ kind, onSubmit, onClose }: { kind: "link" | "embed"; onSubmit(url: string): void; onClose(): void }) {
  const uid = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateUrlInput(kind, value);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onSubmit(r.url);
  };

  return (
    <Dialog labelledBy={titleId} describedBy={hintId} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <h2 id={titleId} className="text-(length:--text-lg) font-semibold text-fg">
            {copy.title}
          </h2>
          <p id={hintId} className={helpClass}>
            {copy.hint}
          </p>
        </div>
        <div className="flex flex-col">
          <label htmlFor={`${uid}-url`} className={labelClass}>
            Web address
          </label>
          <input
            id={`${uid}-url`}
            data-autofocus=""
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="https://"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            className={`${inputClass} text-(length:--text-md)`}
          />
          {error ? (
            <p id={errorId} role="alert" className={errorClass}>
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button type="submit" className={buttonPrimary}>
            {copy.action}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
