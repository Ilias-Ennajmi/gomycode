import { rpc } from '@/core/db';
import { participantsCsv } from '@/core/csv';
import { isAdmin } from '@/core/security';
import type { AdminParticipant } from '@/core/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response('Non autorisé', { status: 401 });
  const sp = new URL(req.url).searchParams;
  const { rows } = await rpc<{ rows: AdminParticipant[] }>('admin_participants', {
    store_id: /^[0-9a-f-]{36}$/.test(sp.get('store') ?? '') ? sp.get('store') : '',
    city: (sp.get('city') ?? '').slice(0, 60),
    filter: sp.get('filter') ?? 'all',
    q: (sp.get('q') ?? '').slice(0, 80),
    limit: 50000,
    offset: 0,
  });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(participantsCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="participants-100ktour-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
