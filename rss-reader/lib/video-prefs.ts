import { readSetting, writeSetting } from "@/lib/push";

// Viewing preferences for videos, shared by every device.
export interface VideoPrefs {
  /** Keep YouTube Shorts out of every list except the YouTube tab's Shorts view. */
  hideShorts: boolean;
}

const KEY = "video-prefs";
const DEFAULTS: VideoPrefs = { hideShorts: false };

export function getVideoPrefs() {
  return readSetting<VideoPrefs>(KEY, DEFAULTS);
}

export async function updateVideoPrefs(changes: Partial<VideoPrefs>) {
  const next = { ...(await getVideoPrefs()), ...changes };
  await writeSetting(KEY, next);
  return next;
}
