"use client";

/**
 * The presenter notes of the slide on screen, docked at the bottom. Plain text only: whatever the notes contain is
 * shown as typed, never as markup. They live on the frame and are never sent to a share link.
 */
export function NotesBar({ notes, slideName }: { notes: string; slideName: string }) {
  const empty = notes.trim() === "";
  return (
    <section
      aria-label="Presenter notes"
      data-testid="present-notes"
      className="pointer-events-auto absolute inset-x-3 bottom-20 mx-auto max-h-[30dvh] max-w-3xl overflow-y-auto rounded-lg border border-line bg-panel p-4 text-fg shadow-3 sm:bottom-[4.5rem]"
    >
      <p className="mb-1 truncate text-(length:--text-xs) font-medium text-fg-muted">{slideName}</p>
      <p className={`text-(length:--text-lg) leading-relaxed whitespace-pre-wrap break-words ${empty ? "text-fg-muted" : ""}`}>{empty ? "No notes for this slide." : notes}</p>
    </section>
  );
}
