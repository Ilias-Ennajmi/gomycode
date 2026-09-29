import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { getOrCreateBriefing } from "@/lib/digest";

// Web Push: the browser (or the Android app, through Chrome) gives us a subscription;
// we send to it with the VAPID keys. Notifications are shown by public/sw.js.

export interface NotifyPrefs {
  /** The morning briefing, sent by the daily cron refresh. */
  briefing: boolean;
  /** A story suddenly covered by many news outlets. */
  breaking: boolean;
  /** The weekly recap, Sunday evening. */
  recap: boolean;
}

const PREFS_KEY = "notify-prefs";
const SENT_KEY = "push-sent";
const DEFAULT_PREFS: NotifyPrefs = { briefing: true, breaking: true, recap: true };

// Breaking: this many different news outlets on one story within the window.
const BREAKING_MIN_SOURCES = 4;
const BREAKING_WINDOW_MS = 6 * 3600 * 1000;
const TIMEZONE = process.env.APP_TIMEZONE || "Africa/Casablanca";

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "https://rss-reader-jet.vercel.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

export function writeSetting(key: string, value: unknown) {
  const json = JSON.stringify(value);
  return prisma.setting.upsert({
    where: { key },
    update: { value: json },
    create: { key, value: json },
  });
}

export function getNotifyPrefs() {
  return readSetting<NotifyPrefs>(PREFS_KEY, DEFAULT_PREFS);
}

export async function setNotifyPrefs(prefs: Partial<NotifyPrefs>) {
  const next = { ...(await getNotifyPrefs()), ...prefs };
  await writeSetting(PREFS_KEY, next);
  return next;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification goes, inside the app. */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag: string;
  image?: string | null;
}

/** Sends to every subscribed device; drops subscriptions the push service says are gone. */
export async function sendToAll(message: PushMessage) {
  if (!pushConfigured()) return 0;
  configure();
  const subscriptions = await prisma.pushSubscription.findMany();
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(message),
          { TTL: 6 * 3600 }
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { endpoint: sub.endpoint } })
            .catch(() => {});
        } else {
          console.error("Push failed", status, error);
        }
      }
    })
  );
  return sent;
}

interface SentLog {
  briefingDate: string | null;
  /** The week (its Monday) whose recap was announced. */
  recapWeek?: string | null;
  /**
   * Articles already announced. Story groups are rebuilt on each refresh (new ids), so a
   * story counts as sent when it contains any of these.
   */
  articles: string[];
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

/** Weekday (0 = Sunday) and hour in the app's time zone. */
function localClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.find((p) => p.type === "weekday")?.value ?? ""
  );
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return { weekday, hour };
}

/**
 * Snoozed articles whose time has come: back to the top of Later, with a notification.
 * Runs on every refresh (hourly), so a snooze wakes within the hour.
 */
export async function wakeSnoozedArticles() {
  const due = await prisma.article.findMany({
    where: { snoozedUntil: { lte: new Date() } },
    select: { id: true, title: true, imageUrl: true },
    orderBy: { snoozedUntil: "asc" },
  });
  if (due.length === 0) return 0;
  await prisma.article.updateMany({
    where: { id: { in: due.map((a) => a.id) } },
    data: { snoozedUntil: null, savedAt: new Date(), isSaved: true, archivedAt: null },
  });
  const first = due[0];
  await sendToAll({
    title: due.length === 1 ? "Back from snooze" : `${due.length} snoozed articles are back`,
    body: due.length === 1 ? first.title : `${first.title} and ${due.length - 1} more, in Later`,
    url: due.length === 1 ? `/reader?view=later&article=${first.id}` : "/reader?view=later",
    tag: "snooze",
    image: first.imageUrl,
  }).catch((error) => console.error("Snooze notification failed", error));
  return due.length;
}

/**
 * Called after every feed refresh. The briefing goes out once a day from the morning cron;
 * breaking stories whenever a refresh finds one that hasn't been sent yet.
 */
export async function sendScheduledPushes({ morning }: { morning: boolean }) {
  if (!pushConfigured() || (await prisma.pushSubscription.count()) === 0) return;
  const prefs = await getNotifyPrefs();
  const log = await readSetting<SentLog>(SENT_KEY, { briefingDate: null, articles: [] });
  let changed = false;

  if (morning && prefs.briefing && log.briefingDate !== todayKey()) {
    const briefing = await getOrCreateBriefing().catch(() => null);
    const lead = briefing?.top[0];
    if (briefing && lead) {
      const more = briefing.top.length - 1;
      await sendToAll({
        title: "Your morning briefing",
        body: more > 0 ? `${lead.headline} · and ${more} more stories` : lead.headline,
        url: "/reader?view=briefing",
        tag: "briefing",
        image: lead.imageUrl,
      });
      log.briefingDate = todayKey();
      changed = true;
    }
  }

  // The weekly recap: Sunday from 18:00, once.
  const clock = localClock();
  const week = weekKey();
  if (prefs.recap && clock.weekday === 0 && clock.hour >= 18 && log.recapWeek !== week) {
    await sendToAll({
      title: "Your week in reading",
      body: "The stories that mattered, what you read and highlighted",
      url: "/reader?view=recap",
      tag: "recap",
    });
    log.recapWeek = week;
    changed = true;
  }

  if (prefs.breaking) {
    const story = await findBreakingStory(new Set(log.articles));
    if (story) {
      await sendToAll({
        title: story.title,
        body: `${story.sources} news outlets are covering this`,
        url: `/reader?view=news&article=${story.articleId}`,
        tag: `story-${story.topicId}`,
        image: story.imageUrl,
      });
      log.articles = [...story.articleIds, ...log.articles].slice(0, 500);
      changed = true;
    }
  }

  if (changed) await writeSetting(SENT_KEY, log);
}

/** The Monday (local date) of the current week, e.g. "2026-09-28". */
export function weekKey(date = new Date()) {
  const { weekday } = localClock(date);
  const monday = new Date(date.getTime() - ((weekday + 6) % 7) * 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(monday);
}

interface BreakingStory {
  topicId: string;
  articleId: string;
  title: string;
  imageUrl: string | null;
  sources: number;
  articleIds: string[];
}

/** The most widely covered new story from the News sources, if it crossed the threshold. */
async function findBreakingStory(sentArticles: Set<string>): Promise<BreakingStory | null> {
  const articles = await prisma.article.findMany({
    where: {
      topicId: { not: null },
      publishedAt: { gte: new Date(Date.now() - BREAKING_WINDOW_MS) },
      feed: { newsDesk: { not: null } },
    },
    select: {
      id: true,
      title: true,
      topicId: true,
      feedId: true,
      imageUrl: true,
      publishedAt: true,
    },
    orderBy: { publishedAt: "asc" },
  });
  const groups = new Map<string, typeof articles>();
  for (const article of articles) {
    const list = groups.get(article.topicId!) ?? [];
    list.push(article);
    groups.set(article.topicId!, list);
  }
  let best: BreakingStory | null = null;
  for (const [topicId, list] of Array.from(groups.entries())) {
    if (list.some((a) => sentArticles.has(a.id))) continue;
    const sources = new Set(list.map((a) => a.feedId)).size;
    if (sources < BREAKING_MIN_SOURCES || (best && best.sources >= sources)) continue;
    const lead = list.find((a) => a.imageUrl) ?? list[0];
    best = {
      topicId,
      articleId: lead.id,
      title: lead.title,
      imageUrl: lead.imageUrl,
      sources,
      articleIds: list.map((a) => a.id),
    };
  }
  return best;
}
