import { displayPhone } from './phone';
import type { AdminParticipant } from './types';

/** Protège Excel contre les cellules interprétées comme des formules. */
function cell(v: string | number): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const HEAD = [
  'Ville', 'Magasin', 'Nom complet', 'Âge', 'Téléphone', 'Email', 'Accepte les offres', 'Langue',
  'Inscription', 'Partie jouée', 'Résultat', 'Code gagnant', 'Bon remis le', 'Remis par',
];

/** CSV lisible par Excel en français (séparateur point-virgule, BOM UTF-8). */
export function participantsCsv(rows: AdminParticipant[]): string {
  const lines = rows.map((p) =>
    [
      p.city, p.store_name, p.full_name, p.age, displayPhone(p.phone), p.email,
      p.marketing_opt_in ? 'Oui' : 'Non', p.lang === 'ar' ? 'Arabe' : 'Français',
      p.created_at.replace('T', ' '), p.played_at.replace('T', ' '),
      !p.played_at ? 'Pas encore joué' : p.won ? 'Gagné' : 'Perdu',
      p.win_code, p.redeemed_at.replace('T', ' '), p.redeemed_by,
    ].map(cell).join(';'),
  );
  return '﻿' + [HEAD.map(cell).join(';'), ...lines].join('\r\n');
}
