'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { rpc } from '@/core/db';
import { backupsEnabled, runBackup } from '@/core/backup';
import { clientIpHash, closeAdminSession, openAdminSession, requireAdmin } from '@/core/security';

type Ok = { ok: boolean; error?: string; winners?: number };

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

function slugify(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** "2,5" ou "2.5" (en %) -> 0.025 */
function percentToRatio(v: string): number | null {
  const n = Number(v.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 1000) / 100000;
}

export async function login(form: FormData) {
  const res = await rpc<Ok>('admin_login', { password: String(form.get('password') ?? ''), ip_hash: await clientIpHash() });
  if (!res.ok) redirect(`/admin/login?err=${res.error === 'rate' ? 'rate' : 'bad'}`);
  await openAdminSession();
  redirect('/admin');
}

export async function logout() {
  await closeAdminSession();
  redirect('/admin/login');
}

/** Retour au tableau de bord, en gardant la ville concernée dépliée. */
function toDashboard(flag: 'ok' | 'err', value: string, city?: string, extra = ''): never {
  const q = new URLSearchParams({ [flag]: value });
  if (city) q.set('ville', city);
  redirect(`/admin?${q.toString()}${extra}`);
}

export async function setCampaign(form: FormData) {
  await requireAdmin();
  await rpc<Ok>('admin_set_campaign', { active: str(form, 'active') === 'true' });
  revalidatePath('/admin', 'layout');
  toDashboard('ok', 'campaign');
}

export async function setStoreActive(form: FormData) {
  await requireAdmin();
  await rpc<Ok>('admin_set_store_active', { id: str(form, 'id'), active: str(form, 'active') === 'true' });
  revalidatePath('/admin', 'layout');
  toDashboard('ok', 'store', str(form, 'city'));
}

export async function saveStore(form: FormData) {
  await requireAdmin();
  const id = str(form, 'id');
  const ratio = percentToRatio(str(form, 'chance'));
  const prizes = Number(str(form, 'prizes_total'));
  const city = str(form, 'city');
  const storeName = str(form, 'store_name');
  const pin = str(form, 'staff_pin');
  if (ratio === null || !Number.isInteger(prizes) || prizes < 0 || !city || (id && !/^\d{6}$/.test(pin))) {
    toDashboard('err', 'invalid', city);
  }
  const res = await rpc<Ok>('admin_save_store', {
    id,
    // Le lien du jeu : choisi à la création, puis figé pour ne pas casser les QR codes imprimés.
    slug: slugify(str(form, 'slug') || `${city} ${storeName}`),
    city,
    store_name: storeName,
    prizes_total: prizes,
    win_probability: ratio,
    staff_pin: pin,
    open_time: str(form, 'open_time'),
    boost_time: str(form, 'boost_time'),
    close_time: str(form, 'close_time'),
    daily_quota: str(form, 'daily_quota') || '1',
    active: false,
  });
  revalidatePath('/admin', 'layout');
  if (!res.ok) toDashboard('err', res.error ?? 'invalid', city);
  toDashboard('ok', id ? 'saved' : 'created', city);
}

export async function deleteStore(form: FormData) {
  await requireAdmin();
  const res = await rpc<Ok>('admin_delete_store', { id: str(form, 'id') });
  revalidatePath('/admin', 'layout');
  if (!res.ok) toDashboard('err', res.error ?? 'invalid', str(form, 'city'));
  toDashboard('ok', 'deleted', str(form, 'city'));
}

export async function saveSettings(form: FormData) {
  await requireAdmin();
  const minAge = Number(str(form, 'min_age'));
  const urls = ['instagram_url', 'tiktok_url', 'website_url'].map((k) => str(form, k));
  const whatsapp = str(form, 'whatsapp_number');
  if (
    !Number.isInteger(minAge) || minAge < 0 || minAge > 99 ||
    urls.some((u) => u && !/^https:\/\/[^\s]+$/.test(u)) ||
    (whatsapp && !/^[+0-9 ]{9,20}$/.test(whatsapp))
  ) {
    redirect('/admin?err=settings');
  }
  const res = await rpc<Ok>('admin_save_settings', {
    starts_at: str(form, 'starts_at'),
    ends_at: str(form, 'ends_at'),
    min_age: minAge,
    instagram_url: urls[0],
    tiktok_url: urls[1],
    website_url: urls[2],
    whatsapp_number: whatsapp,
  });
  revalidatePath('/admin', 'layout');
  redirect(res.ok ? '/admin?ok=settings' : `/admin?err=${res.error === 'dates' ? 'dates' : 'settings'}`);
}

export async function changePassword(form: FormData) {
  await requireAdmin();
  const next = String(form.get('next') ?? '');
  if (next !== String(form.get('confirm') ?? '')) redirect('/admin/reglages?err=mismatch');
  const res = await rpc<Ok>('admin_change_password', { current: String(form.get('current') ?? ''), next });
  redirect(res.ok ? '/admin/reglages?ok=password' : `/admin/reglages?err=${res.error ?? 'invalid'}`);
}

function back(form: FormData, flag: string): never {
  const q = new URLSearchParams(str(form, 'back'));
  q.delete('ok');
  q.set('ok', flag);
  redirect(`/admin/participants?${q.toString()}`);
}

export async function setRedeemed(form: FormData) {
  await requireAdmin();
  await rpc<Ok>('admin_set_redeemed', { id: str(form, 'id'), redeemed: str(form, 'redeemed') === 'true' });
  revalidatePath('/admin', 'layout');
  back(form, 'redeemed');
}

export async function deleteParticipant(form: FormData) {
  await requireAdmin();
  await rpc<Ok>('admin_delete_participant', { id: str(form, 'id') });
  revalidatePath('/admin', 'layout');
  back(form, 'deleted');
}

export async function newPin(form: FormData) {
  await requireAdmin();
  await rpc<Ok>('admin_new_pin', { id: str(form, 'id') });
  revalidatePath('/admin', 'layout');
  toDashboard('ok', 'pin', str(form, 'city'));
}

export async function backupNow() {
  await requireAdmin();
  if (!backupsEnabled()) redirect('/admin?err=backup');
  try {
    await runBackup();
  } catch {
    redirect('/admin?err=backup');
  }
  redirect('/admin?ok=backup');
}
