"use client";

import { useId, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { ImagePlus } from "lucide-react";
import { Dialog } from "@/components/home/Dialog";
import { buttonPrimary, buttonSecondary, helpClass, inputClass, labelClass } from "@/components/ui/controls";
import { captureFiles, captureText } from "@/lib/inbox/capture";
import type { NewInboxItem } from "@/lib/inbox/types";

type Adder = { add(item: NewInboxItem): Promise<void> };
type AssetStore = { addAssetOnly(file: Blob, opts?: { name?: string }): Promise<string> };

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm";

/**
 * One text area for a link or a note, plus pictures: type or paste a link or words and press Enter (Shift+Enter for a new
 * line), paste or drop pictures anywhere on the form, or choose files. Everything lands in the Inbox through `client`; it
 * works offline (the client queues). What was typed is only ever shown as plain text.
 */
export function CaptureForm({
  client,
  uploader,
  onAdded,
  autoFocus,
}: {
  client: Adder;
  uploader: AssetStore;
  /** Called after items were added (the dialog closes itself here). */
  onAdded?: (count: number) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function run(job: () => Promise<{ added: number; problems: string[] }>) {
    setBusy(true);
    setStatus("");
    setProblems([]);
    try {
      const r = await job();
      setProblems(r.problems);
      if (r.added > 0) {
        setStatus(r.added === 1 ? "Added to your Inbox." : `Added ${r.added} items to your Inbox.`);
        onAdded?.(r.added);
      }
    } finally {
      setBusy(false);
    }
  }

  const submitText = () => {
    // Clear at once so the next thing can be typed while this one is being saved; put it back if it was refused.
    const typed = text;
    setText("");
    return run(async () => {
      const r = await captureText(client, typed);
      if (r.ok) return { added: 1, problems: [] };
      if (r.reason !== "empty") setText(typed);
      return { added: 0, problems: [r.message] };
    });
  };

  const submitFiles = (files: File[]) =>
    run(async () => {
      const r = await captureFiles(client, uploader, files);
      return { added: r.added, problems: r.failed.map((f) => `${f.name}: ${f.message}`) };
    });

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submitText();
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return; // plain text pastes into the field as usual
    e.preventDefault();
    void submitFiles(files);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    void submitFiles(files);
  };

  return (
    <div
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
      }}
    >
      <label htmlFor={`${id}-t`} className={labelClass}>
        Link or note
      </label>
      <textarea
        id={`${id}-t`}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        data-autofocus=""
        aria-describedby={`${id}-h`}
        placeholder="Paste a link, or jot a thought"
        className={`${inputClass} resize-y py-2`}
      />
      <p id={`${id}-h`} className={helpClass}>
        Press Enter to add. Shift+Enter starts a new line. You can also paste or drop pictures here.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void submitText()}>
          Add to Inbox
        </button>
        <button type="button" className={buttonSecondary} disabled={busy} onClick={() => file.current?.click()}>
          <ImagePlus size={16} aria-hidden="true" />
          Add pictures or videos
        </button>
        <input
          ref={file}
          data-testid="capture-file-input"
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void submitFiles(files);
          }}
        />
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-(length:--text-sm) text-fg-muted">
        {status}
      </p>
      {problems.length > 0 ? (
        <div role="alert" className="mt-1 text-(length:--text-sm) text-alert">
          <ul className="list-disc pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The Quick capture dialog (command `inbox.capture`, Mod+Shift+I). Closes after something was added; focus goes back to what opened it. */
export function QuickCapture({ client, uploader, onClose }: { client: Adder; uploader: AssetStore; onClose: () => void }) {
  const id = useId();
  return (
    <Dialog labelledBy={`${id}-h`} onClose={onClose} widthClass="w-[min(32rem,calc(100vw-2rem))]">
      <h2 id={`${id}-h`} className="mb-4 text-(length:--text-lg) font-semibold">
        Quick capture
      </h2>
      <CaptureForm client={client} uploader={uploader} autoFocus onAdded={onClose} />
      <div className="mt-4 flex justify-end">
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
