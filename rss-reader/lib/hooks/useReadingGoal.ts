"use client";

import * as React from "react";
import useSWR from "swr";
import { readPref, usePref } from "@/lib/prefs";

// A daily reading goal in minutes, like a fitness ring: today's minutes come from the
// server (what was read today), the goal is a shared preference.

export const GOALS = [10, 20, 30, 45, 60] as const;
const KEY = "reading-goal";

export interface TodayStats {
  minutes: number;
  read: number;
  streak: number;
}

function valid(value: unknown): number {
  const n = Number(value);
  return GOALS.includes(n as (typeof GOALS)[number]) ? n : 20;
}

export function readGoal(): number {
  return valid(readPref<unknown>(KEY, 20));
}

export function useReadingGoal() {
  const [raw, setRaw] = usePref<unknown>(KEY, 20);
  const goal = valid(raw);
  const setGoal = React.useCallback((next: number) => setRaw(next), [setRaw]);
  const { data } = useSWR<TodayStats>("/api/stats/today", {
    refreshInterval: 5 * 60 * 1000,
    dedupingInterval: 30_000,
  });
  const minutes = data?.minutes ?? 0;
  return {
    goal,
    setGoal,
    minutes,
    read: data?.read ?? 0,
    streak: data?.streak ?? 0,
    progress: Math.min(1, minutes / goal),
    done: minutes >= goal,
    loaded: Boolean(data),
  };
}
