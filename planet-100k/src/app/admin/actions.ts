'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { rpc } from '@/core/db';
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

export async function setCampaign(form: FormData) {
  await requireAdmin();
  await rpc<Ok>('admin_set_campaign', { active: str(form, 'active') === 'true' });
  revalidatePath('/admin', 'layout');
  redirect('/admin?ok=campaign');
}

export async function setStoreActive(form: FormData) {
  await requireAdmin();
  await rpc<Ok>('admin_set_store_active', { id: str(form, 'id'), active: str(form, 'active') === 'true' });
  revalidatePath('/admin', 'layout');
  redirect('/admin?ok=store');
}

export async function saveStore(form: FormData) {
  await requireAdmin();
  const id = str(form, 'id');
  const ratio = percentToRatio(str(form, 'chance'));
  const prizes = Number(str(form, 'prizes_total'));
  const city = str(form, 'city');
  const pin = str(form, 'staff_pin');
  if (ratio === null || !Number.isInteger(prizes) || prizes < 0 || !city || (id && !/^\d{6}$/.test(pin))) {
    redirect('/admin?err=invalid');
  }
  const res = await rpc<Ok>('admin_save_store', {
    id,
    slug: slugify(str(form, 'slug') || city),
    city,
    store_name: str(form, 'store_name'),
    prizes_total: prizes,
    win_probability: ratio,
    staff_pin: pin,
    active: false,
  });
  revalidatePath('/admin', 'layout');
  if (!res.ok) redirect(`/admin?err=${res.error ?? 'invalid'}${res.winners ? `&n=${res.winners}` : ''}`);
  redirect(`/admin?ok=${id ? 'saved' : 'created'}`);
}

export async function saveSettings(form: FormData) {
  await requireAdmin();
  const minAge = Number(str(form, 'min_age'));
  const instagram = str(form, 'instagram_url');
  if (!Number.isInteger(minAge) || minAge < 0 || minAge > 99 || (instagram && !/^https:\/\/[^\s]+$/.test(instagram))) {
    redirect('/admin/reglages?err=invalid');
  }
  const res = await rpc<Ok>('admin_save_settings', {
    starts_at: str(form, 'starts_at'),
    ends_at: str(form, 'ends_at'),
    min_age: minAge,
    instagram_url: instagram,
  });
  revalidatePath('/admin', 'layout');
  redirect(res.ok ? '/admin/reglages?ok=saved' : `/admin/reglages?err=${res.error ?? 'invalid'}`);
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
