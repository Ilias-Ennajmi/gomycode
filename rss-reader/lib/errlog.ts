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
