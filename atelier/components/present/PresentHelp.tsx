"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

const KEYS: [string, string][] = [
  ["Right, Space, Page Down", "Next slide"],
  ["Left, Shift+Space, Page Up", "Previous slide"],
  ["Home, End", "First, last slide"],
  ["1 to 9", "Jump to that slide"],
  ["N", "Presenter notes"],
  ["L", "Laser pointer"],
  ["U", "Hide or show the controls"],
  ["F", "Full screen"],
  ["?", "This help"],
  ["Escape", "Close this help, then leave the presentation"],
];

/** The keyboard and touch shortcuts of presentation mode. Escape closes it (the presentation handles the key). */
export function PresentHelp({ onClose }: { onClose(): void }) {
  const titleId = useId();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-(--color-scrim) p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-line bg-panel p-5 text-fg shadow-3">
        <div className="flex items-center gap-2">
          <h2 id={titleId} className="flex-1 text-(length:--text-lg) font-semibold">
            Presentation shortcuts
          </h2>
          <button
            ref={close}
            type="button"
            aria-label="Close help"
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === "Tab") e.preventDefault(); // the dialog has one control: focus stays on it
            }}
            className="inline-flex size-(--target-min) items-center justify-center rounded-sm text-fg-muted hoverable:bg-(--color-selection-fill) hoverable:text-fg"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-(length:--text-sm)">
          {KEYS.map(([k, what]) => (
            <div key={k} className="contents">
              <dt className="font-medium whitespace-nowrap">{k}</dt>
              <dd className="m-0 text-fg-muted">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-(length:--text-sm) text-fg-muted">
          On a touch screen: swipe left or right, or tap the right side for the next slide and the left side for the previous one. Switch on Free roam to pan and
          pinch-zoom the board instead.
        </p>
      </div>
    </div>
  );
}
