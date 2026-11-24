'use server';

import { rpc } from '@/core/db';
import { clientIpHash } from '@/core/security';

export type Voucher = {
  code: string;
  full_name: string;
  phone: string;
  city: string;
  store_name: string;
  played_at: string;
  redeemed_at: string | null;
};

export type VoucherResult = { ok: true; voucher: Voucher } | { ok: false; error: 'no_match' | 'rate' | 'unknown' };

export async function checkVoucher(pin: string, code: string, redeem: boolean): Promise<VoucherResult> {
  if (!/^\d{6}$/.test(pin) || typeof code !== 'string' || code.length < 6 || code.length > 20) {
    return { ok: false, error: 'no_match' };
  }
  try {
    const res = await rpc<({ ok: true } & Voucher) | { ok: false; error: string }>('staff_voucher', {
      pin,
      code,
      redeem,
      ip_hash: await clientIpHash(),
    });
    if (res.ok) return { ok: true, voucher: res };
    return { ok: false, error: res.error === 'rate' ? 'rate' : 'no_match' };
  } catch {
    return { ok: false, error: 'unknown' };
  }
}
