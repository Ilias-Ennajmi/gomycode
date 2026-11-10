import { PUSH_DEADLINE_MS, bearer, cronClient, ensureVapid, isRefused, json, parseTargets, sendPushes, type PushJob } from "@/lib/server/cron";
import { DEFAULT_TIMEZONE, inQuietHours, isValidTimeZone, parseQuiet } from "@/lib/quietHours";

export const maxDuration = 60;

/**
 * Every 5 minutes (pg_cron): sends a push for each time reminder that is due,
 * outside the owner's quiet hours. Reminders that fall in quiet hours wait for
 * the next run after the quiet hours end.
 *
 * Reminders are claimed (marked fired) before anything is sent: an overlapping
 * or retried run gets only the ids it flipped, so nobody is pushed twice. A push
 * that then fails is not retried; the reminder still shows under "For you".
 * Pushes go out in parallel, each with its own timeout, all within a deadline
 * well under maxDuration.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const sb = cronClient();
  if (!sb) return json({ error: "Supabase isn't configured on this deployment." }, 503);
  const secret = bearer(request);
  if (!secret) return json({ error: "unauthorized" }, 401);

  const { data: due, error } = await sb.rpc("cron_due_reminders", { p_secret: secret });
  if (error) return isRefused(error) ? json({ error: "unauthorized" }, 401) : json({ error: "database error" }, 500);
  if (!due?.length) return json({ due: 0 });

  const now = new Date();
  let held = 0;
  const ready = due.filter((r) => {
    const tz = isValidTimeZone(r.timezone) ? r.timezone : DEFAULT_TIMEZONE;
    if (inQuietHours(now, parseQuiet(r.quiet_hours), tz)) {
      held++;
      return false;
    }
    return true;
  });
  if (!ready.length) return json({ due: due.length, fired: 0, held });

  // Claim first. Fired either way: without a device it still shows under "For you" on Today.
  const { data: claimedIds, error: claimError } = await sb.rpc("cron_mark_fired", {
    p_secret: secret,
    p_ids: ready.map((r) => r.id),
  });
  if (claimError) return json({ error: "database error" }, 500);
  const claimed = new Set((claimedIds ?? []).map(String));

  let vapid: Awaited<ReturnType<typeof ensureVapid>> = null;
  try {
    vapid = await ensureVapid(sb, secret);
  } catch {
    vapid = null;
  }

  const jobs: PushJob[] = ready
    .filter((r) => claimed.has(r.id))
    .flatMap((r) =>
      parseTargets(r.subscriptions).map((target) => ({
        target,
        msg: { title: "Remember this?", body: r.title, url: `/item/${r.save_id}`, tag: `reminder-${r.id}` },
      })),
    );
  const res = await sendPushes(jobs, vapid, { deadline: started + PUSH_DEADLINE_MS });

  if (res.gone.length) await sb.rpc("cron_drop_subscriptions", { p_secret: secret, p_endpoints: [...new Set(res.gone)] });
  return json({ due: due.length, fired: claimed.size, held, sent: res.sent, timedOut: res.timedOut, push: Boolean(vapid) });
}
