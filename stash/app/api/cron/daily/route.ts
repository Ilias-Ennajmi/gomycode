import { PUSH_DEADLINE_MS, bearer, cronClient, ensureVapid, isRefused, json, parseTargets, sendPushes, type PushJob } from "@/lib/server/cron";
import { buildDailyQueue, type QueueCandidate } from "@/lib/dailyQueue";

export const maxDuration = 60;

/** Stop building new queues after this; the next hourly run picks up the rest. */
const BUILD_DEADLINE_MS = 25_000;

/**
 * Every hour (pg_cron): for each owner whose daily queue time has passed in
 * their time zone (or whose day is in its last hour) and who has no queue for
 * that day yet, builds "Your N for today" with the same builder the app uses,
 * stores it, and pushes "Your N for today is ready" to their devices.
 * The database refuses to store an empty queue while saves are still
 * processing, so that day stays open for the next run. Pushes go out in
 * parallel after the queues are stored, each with a timeout, within a deadline.
 */
export async function POST(request: Request) {
  const started = Date.now();
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
  let deferred = 0;
  const jobs: PushJob[] = [];
  for (const u of users) {
    if (Date.now() - started > BUILD_DEADLINE_MS) {
      deferred++;
      continue;
    }
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
    if (ids.length) {
      for (const target of parseTargets(u.subscriptions)) {
        jobs.push({
          target,
          msg: { title: `Your ${ids.length} for today is ready`, body: "A few minutes of what you saved. Tap to start.", url: "/today", tag: `daily-${u.day}` },
        });
      }
    }
  }

  const res = await sendPushes(jobs, vapid, { deadline: started + PUSH_DEADLINE_MS });
  if (res.gone.length) await sb.rpc("cron_drop_subscriptions", { p_secret: secret, p_endpoints: [...new Set(res.gone)] });
  return json({ users: users.length, built, deferred, sent: res.sent, timedOut: res.timedOut, push: Boolean(vapid) });
}
