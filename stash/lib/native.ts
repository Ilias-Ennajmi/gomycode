// Knowing we run inside the Android app. The shell opens
// /today?source=android&v=<versionName>; shortcuts and reloads don't carry it,
// so the first value seen is kept (playbook step 3.5).
const KEY = "stash.native";

export type NativeInfo = { android: boolean; version: string | null };

export function captureNativeParams(search: string): NativeInfo {
  const params = new URLSearchParams(search);
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as NativeInfo | null;
    if (params.get("source") === "android") {
      const info = { android: true, version: params.get("v") };
      // A newer APK reports a new version; keep that, otherwise keep the first value.
      if (!stored || stored.version !== info.version) localStorage.setItem(KEY, JSON.stringify(info));
      return info;
    }
    return stored ?? { android: false, version: null };
  } catch {
    return { android: params.get("source") === "android", version: params.get("v") };
  }
}

export function getNativeInfo(): NativeInfo {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "null") as NativeInfo | null) ?? { android: false, version: null };
  } catch {
    return { android: false, version: null };
  }
}
