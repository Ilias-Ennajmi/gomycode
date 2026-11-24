import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

const DEVICE_COOKIE = 'ps100k_device';
const ADMIN_COOKIE = 'ps100k_admin';
const ADMIN_TTL_S = 60 * 60 * 12;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Variable d'environnement manquante : SESSION_SECRET");
  return s;
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

const secure = process.env.NODE_ENV === 'production';

// ------------------------------------------------------------ appareil

export function isDeviceId(v: unknown): v is string {
  return typeof v === 'string' && DEVICE_RE.test(v);
}

export async function readDeviceId(): Promise<string | null> {
  const v = (await cookies()).get(DEVICE_COOKIE)?.value;
  return isDeviceId(v) ? v : null;
}

/** Cookie d'abord, sinon l'identifiant gardé par le navigateur, sinon un nouveau. */
export async function ensureDeviceId(fromClient?: unknown): Promise<string> {
  const id = (await readDeviceId()) ?? (isDeviceId(fromClient) ? fromClient : randomBytes(18).toString('base64url'));
  (await cookies()).set(DEVICE_COOKIE, id, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

// ------------------------------------------------------------- requête

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'inconnue';
  return createHash('sha256').update(`${ip}|${secret()}`).digest('hex').slice(0, 32);
}

export async function userAgent(): Promise<string> {
  return ((await headers()).get('user-agent') ?? '').slice(0, 300);
}

export function hashFingerprint(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 2000) return null;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// --------------------------------------------------------- back-office

export async function openAdminSession(): Promise<void> {
  const exp = String(Math.floor(Date.now() / 1000) + ADMIN_TTL_S);
  (await cookies()).set(ADMIN_COOKIE, `${exp}.${sign(`admin.${exp}`)}`, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/admin',
    maxAge: ADMIN_TTL_S,
  });
}

export async function closeAdminSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: '/admin' });
}

export async function isAdmin(): Promise<boolean> {
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  const [exp, mac] = raw.split('.');
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  const expected = Buffer.from(sign(`admin.${exp}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(exp) > Date.now() / 1000;
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}
