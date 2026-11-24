import 'server-only';
import { get, list, put } from '@vercel/blob';
import { rpc } from './db';
import { participantsCsv } from './csv';
import type { AdminOverview, AdminParticipant } from './types';

export const backupsEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/**
 * Copie complète des participants et des réglages, hors de la base de données.
 * Un fichier par jour (le dernier de la journée remplace les précédents) et un
 * fichier "latest" toujours à jour.
 */
export async function runBackup(): Promise<{ participants: number; day: string }> {
  const [{ rows }, overview] = await Promise.all([
    rpc<{ rows: AdminParticipant[] }>('admin_participants', { filter: 'all', limit: 50000, offset: 0 }),
    rpc<AdminOverview>('admin_overview'),
  ]);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date());
  const csv = participantsCsv(rows);
  const json = JSON.stringify({ saved_at: new Date().toISOString(), overview, participants: rows });
  const opts = { access: 'private' as const, addRandomSuffix: false, allowOverwrite: true };
  await Promise.all([
    put(`sauvegardes/${day}/participants.csv`, csv, { ...opts, contentType: 'text/csv; charset=utf-8' }),
    put(`sauvegardes/${day}/complet.json`, json, { ...opts, contentType: 'application/json' }),
    put('sauvegardes/latest/participants.csv', csv, { ...opts, contentType: 'text/csv; charset=utf-8' }),
  ]);
  return { participants: rows.length, day };
}

export async function listBackups(): Promise<{ day: string; size: number; uploadedAt: Date }[]> {
  const { blobs } = await list({ prefix: 'sauvegardes/', limit: 1000 });
  return blobs
    .filter((b) => /^sauvegardes\/\d{4}-\d{2}-\d{2}\/participants\.csv$/.test(b.pathname))
    .map((b) => ({ day: b.pathname.split('/')[1], size: b.size, uploadedAt: b.uploadedAt }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

export async function readBackup(day: string): Promise<ReadableStream | null> {
  const res = await get(`sauvegardes/${day}/participants.csv`, { access: 'private' });
  return res && res.statusCode === 200 ? res.stream : null;
}
