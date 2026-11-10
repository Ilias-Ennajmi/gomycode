import { bearer, cronClient, ensureVapid, isRefused, json, parseTargets, sendToAll } from "@/lib/server/cron";
import { buildDailyQueue, type QueueCandidate } from "@/lib/dailyQueue";

export const maxDuration = 60;

/**
 * Every hour (pg_cron): for each owner whose daily queue time has passed in
 * their time zone and who has no queue for that day yet, builds "Your N for
 * today" with the same builder the app uses, stores it, and pushes
 * "Your 5 for today is ready" to their devices.
 */
export async function POST(request: Request) {
  const sb = cronClient();
  if (!sb) return json({ error: "Supabase isn't configured on this deployment." }, 503);
  const secret = bearer(request);
  if (!secret) return json({ error: "unauthorized" }, 401);

  const { data: users, error } = await sb.rpc("cron_daily_candidates", { p_secret: secret });
  if (error) return isRefused(error) ? json({ error: "unauthorized" }, 401) : json({ error: "database error" }, 500);
  if (!users?.length) return json({ built: 0 });

  let vapid: Awaited<ReturnType<typeof ensureVapid>> = null;
  try {
    vapid = await ensureVapid(sb, secret);
  } catch {
    // Queues still get built; only the notification is skipped.
  }

  let built = 0;
  let sent = 0;
  const gone: string[] = [];
  for (const u of users) {
    const candidates = (Array.isArray(u.saves) ? u.saves : []) as unknown as QueueCandidate[];
    const ids = buildDailyQueue(candidates, { day: u.day, minutes: u.minutes });
    const { data: stored, error: storeError } = await sb.rpc("cron_store_daily", {
      p_secret: secret,
      p_user_id: u.user_id,
      p_day: u.day,
      p_save_ids: ids,
      p_minutes: u.minutes,
    });
    if (storeError || !stored) continue;
    built++;
    const targets = parseTargets(u.subscriptions);
    if (vapid && targets.length && ids.length) {
      const res = await sendToAll(
        targets,
        { title: `Your ${ids.length} for today is ready`, body: "A few minutes of what you saved. Tap to start.", url: "/today", tag: `daily-${u.day}` },
        vapid,
      );
      sent += res.sent;
      gone.push(...res.gone);
    }
  }
  if (gone.length) await sb.rpc("cron_drop_subscriptions", { p_secret: secret, p_endpoints: gone });
  return json({ users: users.length, built, sent, push: Boolean(vapid) });
}
