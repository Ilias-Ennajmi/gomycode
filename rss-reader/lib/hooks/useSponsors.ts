"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { readPref, usePref } from "@/lib/prefs";
import type { SponsorSegment } from "@/lib/sponsors";

// Skipping sponsor reads: on by default, a shared preference (Settings → Personalise, and
// the player's menu). Each skip says so, with Undo to hear it after all.

const KEY = "skip-sponsors";

export function useSkipSponsors() {
  const [raw, set] = usePref<unknown>(KEY, true);
  return [raw !== false, (on: boolean) => set(on)] as const;
}

export function skipSponsorsOn() {
  return readPref<unknown>(KEY, true) !== false;
}

export function useSponsorSegments(articleId: string | null) {
  const { data } = useSWR<{ segments: SponsorSegment[] }>(
    articleId && !articleId.startsWith("ext:") ? `/api/articles/${articleId}/sponsors` : null,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  return data?.segments ?? [];
}

/**
 * Watches the position and jumps over a sponsor segment once per segment. Undo goes back
 * to its start and leaves that one alone for the rest of the episode or video.
 */
export function useSponsorSkipper(
  key: string | null,
  segments: SponsorSegment[],
  seek: (seconds: number) => void
) {
  const handled = React.useRef(new Set<number>());
  React.useEffect(() => {
    handled.current = new Set();
  }, [key]);
  return React.useCallback(
    (seconds: number) => {
      if (!key || segments.length === 0 || !skipSponsorsOn()) return;
      segments.forEach((segment, i) => {
        if (handled.current.has(i)) return;
        if (seconds >= segment.start && seconds < segment.end - 1) {
          handled.current.add(i);
          seek(segment.end);
          const length = Math.round(segment.end - segment.start);
          toast(`Skipped a sponsor (${length} s)`, {
            action: { label: "Undo", onClick: () => seek(segment.start) },
          });
        }
      });
    },
    [key, segments, seek]
  );
}
