import { rpc } from '@/core/db';
import { displayPhone } from '@/core/phone';
import { isAdmin } from '@/core/security';
import type { AdminParticipant } from '@/core/types';

export const dynamic = 'force-dynamic';

/** Protège Excel contre les cellules interprétées comme des formules. */
function cell(v: string | number): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response('Non autorisé', { status: 401 });
  const sp = new URL(req.url).searchParams;
  const { rows } = await rpc<{ rows: AdminParticipant[] }>('admin_participants', {
    store_id: /^[0-9a-f-]{36}$/.test(sp.get('store') ?? '') ? sp.get('store') : '',
    filter: sp.get('filter') ?? 'all',
    q: (sp.get('q') ?? '').slice(0, 80),
    limit: 5000,
    offset: 0,
  });

  const head = ['Ville', 'Magasin', 'Nom complet', 'Âge', 'Téléphone', 'Email', 'Inscription', 'Partie jouée', 'Résultat', 'Code gagnant', 'Bon remis le', 'Remis par'];
  const lines = rows.map((p) =>
    [
      p.city,
      p.store_name,
      p.full_name,
      p.age,
      displayPhone(p.phone),
      p.email,
      p.created_at.replace('T', ' '),
      p.played_at.replace('T', ' '),
      !p.played_at ? 'Pas encore joué' : p.won ? 'Gagné' : 'Perdu',
      p.win_code,
      p.redeemed_at.replace('T', ' '),
      p.redeemed_by,
    ]
      .map(cell)
      .join(';'),
  );
  const csv = '﻿' + [head.map(cell).join(';'), ...lines].join('\r\n');
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="participants-100k-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
