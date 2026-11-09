import { prisma } from "@/lib/prisma";

// A short log of what went wrong, on the server and in the browser, kept in the Setting
// table so the System page can show it without any outside service.

const KEY = "error-log";
const MAX = 60;

export interface LoggedError {
  at: string;
  /** Where it happened: "refresh", "tick", "client", a route…  */
  scope: string;
  message: string;
  detail?: string;
}

export async function readErrorLog(): Promise<LoggedError[]> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row) return [];
  try {
    return JSON.parse(row.value) as LoggedError[];
  } catch {
    return [];
  }
}

/** Keeps the newest entries; never throws (an error logger that fails helps nobody). */
export async function recordError(scope: string, error: unknown, detail?: string) {
  try {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    const entry: LoggedError = {
      at: new Date().toISOString(),
      scope,
      message: message.slice(0, 300),
      detail: (detail ?? (error instanceof Error ? error.stack : undefined))?.slice(0, 1200),
    };
    const log = [entry, ...(await readErrorLog())].slice(0, MAX);
    await prisma.setting.upsert({
      where: { key: KEY },
      update: { value: JSON.stringify(log) },
      create: { key: KEY, value: JSON.stringify(log) },
    });
  } catch {
    // The console still has it.
  }
}

export async function clearErrorLog() {
  await prisma.setting.deleteMany({ where: { key: KEY } });
}

// Telling problems apart. A busy or rate-limited outside service (Gemini's "high demand",
// a site's 429, a timeout, a dropped connection) fixes itself on the next run: it's a
// warning in the logs, not an error, and nobody needs waking for it. Anything else is a
// real error: logged, kept in the error log, and announced once a day per kind by push.

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_TEXT =
  /\b(408|425|429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|rate.?limit|quota|timed? ?out|timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EPIPE|fetch failed|socket hang up|network error|aborted/i;

/** True when the problem is an outside service being busy or unreachable for a while. */
export function isTransient(error: unknown): boolean {
  if (!error) return false;
  const { status, statusCode, name, code } = error as {
    status?: number;
    statusCode?: number;
    name?: string;
    code?: string;
  };
  if (TRANSIENT_STATUS.has(Number(status ?? statusCode))) return true;
  if (name === "AbortError" || name === "TimeoutError") return true;
  if (typeof code === "string" && TRANSIENT_TEXT.test(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: unknown }).cause;
  return TRANSIENT_TEXT.test(message) || (cause ? isTransient(cause) : false);
}

const ALERTS_KEY = "error-alerts";
const ALERT_EVERY_MS = 24 * 60 * 60 * 1000;

/** The same kind of error, whatever ids, numbers or URLs it mentions. */
export function problemSignature(scope: string, message: string) {
  return `${scope}:${message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\b[a-z0-9]{20,}\b/gi, "<id>")
    .replace(/\d+/g, "#")
    .slice(0, 100)}`;
}

/** A push to the owner, at most once a day for each kind of error. Never throws. */
async function alertOwner(scope: string, message: string) {
  try {
    const signature = problemSignature(scope, message);
    const row = await prisma.setting.findUnique({ where: { key: ALERTS_KEY } });
    const sent = row ? (JSON.parse(row.value) as Record<string, string>) : {};
    const last = sent[signature] ? Date.parse(sent[signature]) : 0;
    if (Date.now() - last < ALERT_EVERY_MS) return;
    const { getNotifyPrefs, sendToAll } = await import("@/lib/push");
    if (!(await getNotifyPrefs()).problems) return;
    // Old entries go, so the map stays small.
    const fresh = Object.fromEntries(
      Object.entries(sent).filter(([, at]) => Date.now() - Date.parse(at) < ALERT_EVERY_MS * 7)
    );
    fresh[signature] = new Date().toISOString();
    await prisma.setting.upsert({
      where: { key: ALERTS_KEY },
      update: { value: JSON.stringify(fresh) },
      create: { key: ALERTS_KEY, value: JSON.stringify(fresh) },
    });
    await sendToAll({
      title: "Reader hit a problem",
      body: `${scope}: ${message}`.slice(0, 180),
      url: "/reader?view=settings",
      tag: `problem-${signature.slice(0, 40)}`,
    });
  } catch {
    // Alerting is best effort; the log still has it.
  }
}

/**
 * Reports a problem from server code: a warning when it's transient (see isTransient), else
 * an error in the logs, the error log (System sheet) and a push to the owner. Never throws.
 */
export async function reportProblem(scope: string, error: unknown, detail?: string) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  if (isTransient(error)) {
    console.warn(`${scope} (will retry): ${message.slice(0, 300)}`);
    return;
  }
  console.error(scope, error);
  await recordError(scope, error, detail);
  await alertOwner(scope, message.slice(0, 300));
}
