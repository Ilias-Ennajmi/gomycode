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
}

const PREFS_KEY = "notify-prefs";
const SENT_KEY = "push-sent";
const DEFAULT_PREFS: NotifyPrefs = { briefing: true, breaking: true };

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

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: unknown) {
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
  /**
   * Articles already announced. Story groups are rebuilt on each refresh (new ids), so a
   * story counts as sent when it contains any of these.
   */
  articles: string[];
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
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
