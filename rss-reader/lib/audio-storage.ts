export const BLOCKED_KEY = "fx-blocked-origins";

export function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Servers that refused CORS: their episodes stream plainly, without effects. */
export function originBlocked(origin: string) {
  try {
    return (JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? "[]") as string[]).includes(origin);
  } catch {
    return false;
  }
}

export function blockOrigin(origin: string) {
  try {
    const list = JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? "[]") as string[];
    localStorage.setItem(BLOCKED_KEY, JSON.stringify([...new Set([...list, origin])].slice(-100)));
  } catch {
    // Not remembered: asked again next time.
  }
}

export function remember(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: only this visit remembers.
  }
}
