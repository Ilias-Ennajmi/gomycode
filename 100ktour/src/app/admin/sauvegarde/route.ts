import { backupsEnabled, readBackup } from '@/core/backup';
import { isAdmin } from '@/core/security';

export const dynamic = 'force-dynamic';

/** Téléchargement d'une sauvegarde quotidienne : /admin/sauvegarde?jour=2026-11-25 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response('Non autorisé', { status: 401 });
  const day = new URL(req.url).searchParams.get('jour') ?? '';
  if (!backupsEnabled() || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Response('Introuvable', { status: 404 });
  const stream = await readBackup(day);
  if (!stream) return new Response('Introuvable', { status: 404 });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sauvegarde-100ktour-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
