"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buttonPrimary, buttonSecondary, helpClass, inputClass, labelClass } from "@/components/ui/controls";
import { copyText } from "@/lib/share/copy";
import { qrDataUrl } from "@/lib/share/qr";
import type { ToastFn } from "@/lib/engine/commands/registry";

type Props = {
  /** The one and only time the link's address is known. It lives in this component's props and nowhere else. */
  url: string;
  name: string;
  toast: ToastFn;
  onDone(): void;
  onAnother(): void;
};

/**
 * Shown once, right after a link was made: the address with a Copy button, a QR code for opening it on a phone, and a plain
 * warning that it can't be shown again. The address is selected on arrival so Ctrl+C works at once. Nothing here stores it:
 * not in browser storage, not in the console, not in the links list. Closing the dialog drops it with the component.
 */
export function CreatedLink({ url, name, toast, onDone, onAnother }: Props) {
  const field = useRef<HTMLInputElement>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  useEffect(() => {
    let alive = true;
    qrDataUrl(url).then(
      (u) => alive && setQr(u),
      () => alive && setQr(null),
    );
    return () => {
      alive = false;
    };
  }, [url]);

  async function copy() {
    const outcome = await copyText(url, field.current);
    if (outcome === "copied") {
      setCopied(true);
      setHint(null);
      toast({ message: "Link copied", durationMs: 3000 });
    } else {
      setHint("Your browser would not copy it. The link is selected: press Ctrl+C (Cmd+C on a Mac).");
    }
  }

  return (
    <div data-created-link="" className="flex flex-col gap-4">
      <p role="alert" className="flex items-start gap-2 rounded-md border border-alert px-3 py-2 text-(length:--text-sm)" data-once-warning="">
        <TriangleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-alert" />
        <span>
          <strong className="font-semibold">This link can&apos;t be shown again.</strong> Copy it now. For your clients&apos; privacy Atelier keeps only a fingerprint of it. If you lose it, create a new link and revoke this one.
        </span>
      </p>

      <div>
        <label htmlFor="share-created-url" className={labelClass}>
          Link for {name}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="share-created-url"
            ref={field}
            readOnly
            value={url}
            className={`${inputClass} font-mono text-(length:--text-sm)`}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            autoComplete="off"
            data-share-url=""
          />
          <button type="button" className={`${buttonPrimary} shrink-0 max-sm:w-full`} onClick={() => void copy()}>
            {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        {hint ? (
          <p role="status" className={helpClass}>
            {hint}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="grid size-40 shrink-0 place-items-center rounded-md border border-line bg-canvas p-1" data-qr="">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL made on this device
            <img src={qr} alt={`QR code for the link to ${name}. Scan it with a phone camera to open the link.`} width={152} height={152} className="size-full" />
          ) : (
            <span className="text-(length:--text-sm) text-fg-muted" aria-hidden="true">
              …
            </span>
          )}
        </div>
        <p className={`${helpClass} mt-0`}>Scan this with a phone to open the link there. Like the link itself, it disappears when you leave this screen.</p>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className={buttonSecondary} onClick={onAnother}>
          Create another
        </button>
        <button type="button" className={buttonPrimary} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
