"use client";

import { useSyncExternalStore } from "react";

const format = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** The phone's local date (rendered on the client so the time zone is right). */
export function TodayDate() {
  const label = useSyncExternalStore(
    () => () => {},
    format,
    () => "",
  );
  return <span suppressHydrationWarning>{label}</span>;
}
