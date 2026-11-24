import { timingSafeEqual } from 'node:crypto';
import { backupsEnabled, runBackup } from '@/core/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Appelée chaque nuit par Vercel Cron, avec le secret CRON_SECRET en en-tête. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response('Non autorisé', { status: 401 });
  }
  if (!backupsEnabled()) return Response.json({ ok: false, error: 'stockage non configuré' }, { status: 503 });
  return Response.json({ ok: true, ...(await runBackup()) });
}
