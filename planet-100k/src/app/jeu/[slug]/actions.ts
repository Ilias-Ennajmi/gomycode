'use server';

import { rpc } from '@/core/db';
import { normalizePhone } from '@/core/phone';
import { clientIpHash, ensureDeviceId, hashFingerprint, isDeviceId, readDeviceId, userAgent } from '@/core/security';
import type { GameState, Me, StoreStatus } from '@/core/types';

const SLUG = /^[a-z0-9-]{2,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type RegisterInput = {
  slug: string;
  fullName: string;
  age: string;
  phone: string;
  email: string;
  consent: boolean;
  deviceId: string | null;
  fingerprint: string;
};

export type RegisterResult =
  | { ok: true; participantId: string; deviceId: string }
  | { ok: false; error: 'fields'; fields: Partial<Record<'fullName' | 'age' | 'phone' | 'email' | 'consent', string>> }
  | { ok: false; error: 'already_played'; me: Me; deviceId: string }
  | { ok: false; error: 'closed'; status: StoreStatus }
  | { ok: false; error: 'phone_used' | 'rate' | 'unknown' };

type DbRegister =
  | { ok: true; participant_id: string }
  | { ok: false; error: string; me?: Me; status?: StoreStatus; min_age?: number };

export async function register(input: RegisterInput): Promise<RegisterResult> {
  if (!SLUG.test(input.slug)) return { ok: false, error: 'unknown' };

  const fields: Partial<Record<'fullName' | 'age' | 'phone' | 'email' | 'consent', string>> = {};
  const fullName = String(input.fullName ?? '').replace(/\s+/g, ' ').trim();
  if (fullName.length < 3 || fullName.length > 80 || !fullName.includes(' ')) {
    fields.fullName = 'Indiquez votre prénom et votre nom.';
  }
  const age = Number(String(input.age ?? '').trim());
  if (!Number.isInteger(age) || age < 1 || age > 110) fields.age = 'Indiquez votre âge en chiffres.';
  const phone = normalizePhone(String(input.phone ?? ''));
  if (!phone) fields.phone = 'Indiquez un numéro de mobile marocain, par exemple 06 12 34 56 78.';
  const email = String(input.email ?? '').trim().toLowerCase();
  if (email && (email.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    fields.email = "Cette adresse email n'est pas valide.";
  }
  if (!input.consent) fields.consent = 'Cochez cette case pour participer.';
  if (Object.keys(fields).length) return { ok: false, error: 'fields', fields };

  const deviceId = await ensureDeviceId(input.deviceId);
  const res = await rpc<DbRegister>('register', {
    slug: input.slug,
    device_id: deviceId,
    full_name: fullName,
    age,
    phone,
    email,
    fingerprint: hashFingerprint(input.fingerprint),
    ip_hash: await clientIpHash(),
    user_agent: await userAgent(),
  });

  if (res.ok) return { ok: true, participantId: res.participant_id, deviceId };
  switch (res.error) {
    case 'age':
      return {
        ok: false,
        error: 'fields',
        fields: { age: `Le jeu est réservé aux personnes de ${res.min_age ?? 18} ans et plus.` },
      };
    case 'already_played':
      return res.me ? { ok: false, error: 'already_played', me: res.me, deviceId } : { ok: false, error: 'unknown' };
    case 'closed':
      return { ok: false, error: 'closed', status: res.status ?? 'paused' };
    case 'phone_used':
      return { ok: false, error: 'phone_used' };
    case 'rate':
      return { ok: false, error: 'rate' };
    default:
      return { ok: false, error: 'unknown' };
  }
}

export type SpinResult =
  | { ok: true; me: Me }
  | { ok: false; error: 'closed'; status: StoreStatus }
  | { ok: false; error: 'not_found' | 'unknown' };

export async function spin(participantId: string): Promise<SpinResult> {
  const deviceId = await readDeviceId();
  if (!deviceId || !UUID.test(participantId)) return { ok: false, error: 'not_found' };
  const res = await rpc<{ ok: true; me: Me } | { ok: false; error: string; status?: StoreStatus }>('spin', {
    participant_id: participantId,
    device_id: deviceId,
  });
  if (res.ok) return { ok: true, me: res.me };
  if (res.error === 'closed') return { ok: false, error: 'closed', status: res.status ?? 'paused' };
  return { ok: false, error: res.error === 'not_found' ? 'not_found' : 'unknown' };
}

/** Le cookie a disparu mais le navigateur a gardé son identifiant : on le rétablit. */
export async function resume(slug: string, storedDeviceId: string): Promise<Me | null> {
  if (!SLUG.test(slug) || !isDeviceId(storedDeviceId)) return null;
  if (await readDeviceId()) return null;
  const deviceId = await ensureDeviceId(storedDeviceId);
  const state = await rpc<GameState | { found: false }>('game_state', { slug, device_id: deviceId });
  return state.found ? state.me : null;
}
