import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function dayDiffFromToday(d: Date, now: Date): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
}

/** "just now", "5m ago", "2h ago", "Yesterday", "Aug 1" */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffSec = Math.round((now.getTime() - d.getTime()) / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);

  if (diffSec < 45) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;

  const dayDiff = dayDiffFromToday(d, now);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** Date separator label: "Today", "Yesterday", "Mon, Aug 3" */
export function formatDateSeparator(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dayDiff = dayDiffFromToday(d, new Date());

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const WORDS_PER_MINUTE = 200;

/** "3 min read" based on ~200 words/minute */
export function readingTime(content?: string | null): string {
  if (!content) return "1 min read";
  const words = content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`;
}

export function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function getInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || "?";
}

const FAVICON_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];

export function getFaviconFallbackColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FAVICON_COLORS[Math.abs(hash) % FAVICON_COLORS.length];
}
