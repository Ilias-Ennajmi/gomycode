'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="b b-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt('Copiez ce lien :', text);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? 'Copié' : label}
    </button>
  );
}

/** Bouton d'envoi qui demande confirmation avant une action irréversible. */
export function ConfirmSubmit({
  question,
  children,
  className = 'b b-danger',
  formAction,
}: {
  question: string;
  children: React.ReactNode;
  className?: string;
  formAction?: (form: FormData) => void | Promise<void>;
}) {
  return (
    <button
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
