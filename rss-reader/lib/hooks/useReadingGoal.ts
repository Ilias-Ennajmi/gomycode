"use client";

import * as React from "react";
import useSWR from "swr";

// A daily reading goal in minutes, like a fitness ring: today's minutes come from the
// server (what was read today), the goal lives on the device.

export const GOALS = [10, 20, 30, 45, 60] as const;
const KEY = "reading-goal";

export interface TodayStats {
  minutes: number;
  read: number;
  streak: number;
}

export function readGoal(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return GOALS.includes(n as (typeof GOALS)[number]) ? n : 20;
  } catch {
    return 20;
  }
}

export function useReadingGoal() {
  const [goal, setGoalState] = React.useState(20);
  React.useEffect(() => setGoalState(readGoal()), []);
  const setGoal = React.useCallback((next: number) => {
    setGoalState(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // This visit only.
    }
  }, []);
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
