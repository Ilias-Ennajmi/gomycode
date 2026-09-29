// Helpers for running inside the Android app (a Trusted Web Activity around this site).
// The app opens /reader?source=android&v=<version>; that's remembered so later visits
// (shortcuts, shared links, reloads) still know they're in the app.

const APP_VERSION_KEY = "android-app-version";
const RELEASES_URL = "https://api.github.com/repos/Ilias-Ennajmi/gomycode/releases?per_page=10";
export const RELEASES_PAGE = "https://github.com/Ilias-Ennajmi/gomycode/releases";

/** Reads ?source=android&v=… once on load. */
export function rememberAppLaunch(params: URLSearchParams) {
  if (params.get("source") !== "android") return;
  try {
    // Shortcuts open without a version: keep the one the app launched with.
    const version = params.get("v") || localStorage.getItem(APP_VERSION_KEY) || "0";
    localStorage.setItem(APP_VERSION_KEY, version);
  } catch {
    // Storage blocked: only this visit knows.
  }
}

/** The Android app's version, or null in a normal browser. */
export function androidAppVersion(): string | null {
  try {
    return localStorage.getItem(APP_VERSION_KEY);
  } catch {
    return null;
  }
}

/** A short tap on phones that support it; does nothing elsewhere. */
export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not allowed here.
  }
}

function compareVersions(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

const UPDATE_CHECK_KEY = "android-update-check";

/**
 * The newest Android release if it's newer than the installed app. Checked at most
 * once a day (GitHub allows 60 unauthenticated calls an hour).
 */
export async function newerAppRelease(): Promise<{ version: string; url: string } | null> {
  const installed = androidAppVersion();
  if (!installed) return null;
  let latest: { version: string; url: string } | null = null;
  try {
    const cached = JSON.parse(localStorage.getItem(UPDATE_CHECK_KEY) || "null");
    if (cached && Date.now() - cached.at < 24 * 3600 * 1000) latest = cached.latest;
  } catch {
    // Ignore a broken cache.
  }
  if (!latest) {
    const res = await fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const releases: { tag_name: string; html_url: string; draft: boolean }[] = await res.json();
    const release = releases.find((r) => !r.draft && r.tag_name.startsWith("android-v"));
    if (!release) return null;
    latest = { version: release.tag_name.replace("android-v", ""), url: release.html_url };
    try {
      localStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify({ at: Date.now(), latest }));
    } catch {
      // Checked again next time.
    }
  }
  return compareVersions(latest.version, installed) > 0 ? latest : null;
}
