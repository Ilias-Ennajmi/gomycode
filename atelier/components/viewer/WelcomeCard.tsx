"use client";

import { ModalShell } from "./ModalShell";

/** First visit to a link that has a welcome note: the studio's words (plain text, line breaks kept) before the board. */
export function WelcomeCard({ studioName, title, note, onClose }: { studioName: string; title: string; note: string; onClose: () => void }) {
  return (
    <ModalShell label="Welcome" onClose={onClose} variant="center">
      {studioName ? <p className="vw-eyebrow">{studioName}</p> : null}
      <h2 className="vw-serif vw-h2">{title}</h2>
      <p className="vw-note">{note}</p>
      <button type="button" className="vw-btn vw-btn-primary" onClick={onClose} data-autofocus="">
        View the board
      </button>
    </ModalShell>
  );
}
