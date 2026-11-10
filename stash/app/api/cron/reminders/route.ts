import { bearer, cronClient, ensureVapid, isRefused, json, parseTargets, sendToAll } from "@/lib/server/cron";
import { DEFAULT_TIMEZONE, inQuietHours, isValidTimeZone, parseQuiet } from "@/lib/quietHours";

export const maxDuration = 60;

/**
 * Every 5 minutes (pg_cron): sends a push for each time reminder that is due,
 * outside the owner's quiet hours, then marks it fired. Reminders that fall in
 * quiet hours wait for the next run after the quiet hours end.
 */
export async function POST(request: Request) {
  const sb = cronClient();
  if (!sb) return json({ error: "Supabase isn't configured on this deployment." }, 503);
  const secret = bearer(request);
  if (!secret) return json({ error: "unauthorized" }, 401);

  const { data: due, error } = await sb.rpc("cron_due_reminders", { p_secret: secret });
  if (error) return isRefused(error) ? json({ error: "unauthorized" }, 401) : json({ error: "database error" }, 500);
  if (!due?.length) return json({ due: 0 });

  let vapid;
  try {
    vapid = await ensureVapid(sb, secret);
  } catch {
    vapid = null;
  }

  const now = new Date();
  const fired: string[] = [];
  const gone = new Set<string>();
  let sent = 0;
  let held = 0;
  for (const r of due) {
    const tz = isValidTimeZone(r.timezone) ? r.timezone : DEFAULT_TIMEZONE;
    if (inQuietHours(now, parseQuiet(r.quiet_hours), tz)) {
      held++;
      continue;
    }
    const targets = parseTargets(r.subscriptions);
    if (vapid && targets.length) {
      const res = await sendToAll(
        targets,
        { title: "Remember this?", body: r.title, url: `/item/${r.save_id}`, tag: `reminder-${r.id}` },
        vapid,
      );
      sent += res.sent;
      res.gone.forEach((g) => gone.add(g));
    }
    // Fired either way: without a device it still shows under "For you" on Today.
    fired.push(r.id);
  }

  if (fired.length) await sb.rpc("cron_mark_fired", { p_secret: secret, p_ids: fired });
  if (gone.size) await sb.rpc("cron_drop_subscriptions", { p_secret: secret, p_endpoints: [...gone] });
  return json({ due: due.length, fired: fired.length, held, sent, push: Boolean(vapid) });
}
