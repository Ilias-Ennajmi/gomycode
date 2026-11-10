import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "@/lib/supabase/types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env";

/*
 * Cron routes. Supabase pg_cron calls them with `Authorization: Bearer
 * <stash_cron_secret>` (a Vault secret). The app never holds that secret or a
 * service-role key: it passes the token it received to SECURITY DEFINER
 * functions that compare it with Vault and refuse otherwise. VAPID keys live
 * in Vault too; the first run generates them.
 */

export type CronClient = ReturnType<typeof createClient<Database, "stash">>;

export function cronClient(): CronClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient<Database, "stash">(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "stash" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m && m[1].length >= 16 && m[1].length <= 512 ? m[1] : null;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const isRefused = (e: { code?: string } | null) => e?.code === "42501";

export type Vapid = { publicKey: string; privateKey: string; subject: string };

/** VAPID keys from Vault, generated and stored on the first run. Null if Vault isn't reachable. */
export async function ensureVapid(sb: CronClient, secret: string): Promise<Vapid | null> {
  const read = async () => {
    const { data, error } = await sb.rpc("cron_vapid", { p_secret: secret });
    if (error) throw error;
    return data?.[0] ?? null;
  };
  let row = await read();
  if (!row?.public_key || !row.private_key) {
    const keys = webpush.generateVAPIDKeys();
    const { error } = await sb.rpc("cron_set_vapid", { p_secret: secret, p_public: keys.publicKey, p_private: keys.privateKey });
    if (error) throw error;
    row = await read(); // another run may have won the race: use what's stored
  }
  if (!row?.public_key || !row.private_key) return null;
  const site = (row.subject ?? "").replace(/\/+$/, "");
  return {
    publicKey: row.public_key,
    privateKey: row.private_key,
    subject: site.startsWith("https://") ? site : "mailto:stash@example.invalid",
  };
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string; tag?: string };

export function parseTargets(v: unknown): PushTarget[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const t = x as Partial<PushTarget> | null;
    return t && typeof t.endpoint === "string" && typeof t.p256dh === "string" && typeof t.auth === "string"
      ? [{ endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth }]
      : [];
  });
}

/** Sends to every device; returns how many went out and which endpoints are gone for good. */
export async function sendToAll(targets: PushTarget[], msg: PushMessage, vapid: Vapid): Promise<{ sent: number; gone: string[] }> {
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(msg), {
          vapidDetails: vapid,
          TTL: 6 * 3600,
          urgency: "normal",
          timeout: 10_000,
        });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(t.endpoint);
      }
    }),
  );
  return { sent, gone };
}
