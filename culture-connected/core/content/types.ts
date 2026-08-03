import type { Localized } from '@/core/i18n/localized';

/** A headline split into a plain prefix, a red accent word/phrase, and an optional suffix. */
export interface AccentHeading {
  prefix: Localized;
  accent: Localized;
  suffix?: Localized;
  /** Home page draws a bottom-anchored highlight band behind the accent text. */
  highlight?: boolean;
}

export interface StatItem {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: Localized;
  sublabel?: string;
  /** Case-studies anchor this stat deep-links to, e.g. "eden". */
  anchor?: string;
}

export function formatStat(stat: Pick<StatItem, 'value' | 'decimals' | 'prefix' | 'suffix'>): string {
  const { value, decimals = 0, prefix = '', suffix = '' } = stat;
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}
