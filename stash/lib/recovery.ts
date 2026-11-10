"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import { IDENTITY_FLAG } from "@/lib/supabase/session";
import { flush, pending } from "@/lib/outbox";
import { isValidCode, normalizeCode, recoveryError, type RecoveryError } from "@/lib/recoveryCode";

/*
 * Move to a new phone (contract 0007 §4.3). The Edge Function `stash-recovery` makes the
 * code and checks it; this file only calls it, swaps the session and clears what the
 * previous identity left on the phone.
 */

export class RecoveryFailure extends Error {
  constructor(public readonly kind: RecoveryError) {
    super(kind);
  }
}

async function failureOf(error: unknown): Promise<RecoveryFailure> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    let code: string | null = null;
    try {
      code = ((await context.clone().json()) as { error?: string } | null)?.error ?? null;
    } catch {
      // no JSON body: decided by the status alone
    }
    return new RecoveryFailure(recoveryError(context.status, code));
  }
  return new RecoveryFailure(recoveryError(null, null));
}

function client() {
  const supabase = getBrowserClient();
  if (!supabase) throw new RecoveryFailure("unavailable");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new RecoveryFailure("offline");
  return supabase;
}

export type RecoveryState = { createdAt: string; lastRestoredAt: string | null } | null;

/** Whether this identity has a recovery code (never the code itself: it is stored nowhere). */
export async function fetchRecoveryState(): Promise<RecoveryState> {
  const supabase = getBrowserClient();
  if (!supabase) return null;
  // Column list on purpose: `select *` is denied on this table.
  const { data } = await supabase.from("recovery").select("user_id, created_at, last_restored_at").maybeSingle();
  return data ? { createdAt: data.created_at, lastRestoredAt: data.last_restored_at } : null;
}

export type CreatedCode = { code: string; createdAt: string; signedIn: boolean };
type CreateAnswer = { code?: string; created_at?: string; access_token?: string | null; refresh_token?: string | null };
type SetSession = (tokens: { access_token: string; refresh_token: string }) => Promise<{ data: { session: unknown }; error: unknown }>;

/**
 * Takes the answer of `create`: the code, and the fresh session that comes with it.
 *
 * Making a code gives this identity a password, which ends the session this phone had. The
 * function signs in again and returns the new session next to the code, so it is put in place
 * before the code is shown. If that fails, the code is still handed back (`signedIn: false`):
 * it is then the only way back in, and the caller says so.
 */
export async function adoptCreatedCode(out: CreateAnswer | null, setSession: SetSession): Promise<CreatedCode> {
  if (!out?.code || !isValidCode(out.code)) throw new RecoveryFailure("failed");
  let signedIn = false;
  if (out.access_token && out.refresh_token) {
    try {
      const { data, error } = await setSession({ access_token: out.access_token, refresh_token: out.refresh_token });
      signedIn = !error && !!data.session;
    } catch {
      signedIn = false;
    }
  }
  return { code: out.code, createdAt: out.created_at ?? new Date().toISOString(), signedIn };
}

/** Makes (or replaces) the recovery code. It is returned once and never again. */
export async function createRecoveryCode(): Promise<CreatedCode> {
  const supabase = client();
  const { data, error } = await supabase.functions.invoke("stash-recovery", { body: { action: "create" } });
  if (error) throw await failureOf(error);
  return adoptCreatedCode(data as CreateAnswer | null, (tokens) => supabase.auth.setSession(tokens));
}

// Things the previous identity left on this phone. Look and player preferences stay.
const KEEP = new Set(["stash.appearance", "stash.play.sessions", "stash.play.captions", "stash.play.hints"]);

export function clearLocalData(newUserId?: string) {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("stash.") && !KEEP.has(key)) localStorage.removeItem(key);
    if (newUserId) localStorage.setItem(IDENTITY_FLAG, newUserId);
  } catch {
    // private mode: nothing was stored
  }
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "identity-changed" });
  } catch {
    // no worker: nothing cached
  }
}

/** Saves still waiting on this phone would be sent to the wrong identity: send them first. */
export async function unsentSaves(): Promise<number> {
  await flush().catch(() => 0);
  return (await pending()).length;
}

/**
 * Signs this phone in to the Stash the code belongs to. On success the caller reloads the
 * app. Saves made on this phone before stay with its old identity.
 */
export async function restoreFromCode(code: string): Promise<{ userId: string }> {
  if (!isValidCode(code)) throw new RecoveryFailure("invalid_code");
  const supabase = client();
  // With an identity on this phone, its waiting saves belong to it and must be sent first.
  // Without one (a brand-new phone), waiting saves simply go to the restored Stash afterwards.
  const { data: current } = await supabase.auth.getSession();
  if (current.session && (await unsentSaves()) > 0) throw new RecoveryFailure("pending_saves");
  const { data, error } = await supabase.functions.invoke("stash-recovery", { body: { action: "restore", code: normalizeCode(code) } });
  if (error) throw await failureOf(error);
  const out = data as { access_token?: string; refresh_token?: string; user_id?: string } | null;
  if (!out?.access_token || !out.refresh_token) throw new RecoveryFailure("failed");
  const { data: set, error: sessionError } = await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token });
  if (sessionError || !set.session) throw new RecoveryFailure("failed");
  clearLocalData(set.session.user.id);
  return { userId: set.session.user.id };
}
