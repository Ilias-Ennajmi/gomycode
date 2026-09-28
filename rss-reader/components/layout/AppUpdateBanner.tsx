"use client";

import * as React from "react";
import { Download, X } from "lucide-react";
import { newerAppRelease } from "@/lib/native";

const DISMISSED_KEY = "android-update-dismissed";

/**
 * Inside the Android app, a slim bar when a newer app release is on GitHub. Rarely shown:
 * features arrive through the website, so a new app is only needed when its shell changes.
 */
export function AppUpdateBanner() {
  const [release, setRelease] = React.useState<{ version: string; url: string } | null>(null);

  React.useEffect(() => {
    newerAppRelease()
      .then((found) => {
        if (!found) return;
        try {
          if (localStorage.getItem(DISMISSED_KEY) === found.version) return;
        } catch {
          // Show it anyway.
        }
        setRelease(found);
      })
      .catch(() => {
        // Offline or rate-limited: try again another day.
      });
  }, []);

  if (!release) return null;

  function dismiss() {
    try {
      if (release) localStorage.setItem(DISMISSED_KEY, release.version);
    } catch {
      // Hidden for this visit only.
    }
    setRelease(null);
  }

  return (
    <div className="flex shrink-0 items-center gap-2 bg-primary px-3 py-2 text-sm text-primary-foreground">
      <Download className="h-4 w-4 shrink-0" />
      <a href={release.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate">
        Reader {release.version} is available.{" "}
        <span className="font-semibold underline">Update</span>
      </a>
      <button
        type="button"
        onClick={dismiss}
        className="rounded p-1 hover:bg-primary-foreground/10"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
