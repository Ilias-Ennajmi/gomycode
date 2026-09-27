import type { Locale } from './config';

/**
 * A piece of copy that may or may not have French translation yet.
 * Mirrors the source design: only nav, headlines, CTAs and form labels
 * currently have French copy (see design_handoff_culture_connected/README.md).
 * Untranslated fields simply omit `fr` and fall back to English on /fr.
 */
export interface Localized {
  en: string;
  fr?: string;
}

export function t(value: Localized, locale: Locale): string {
  return locale === 'fr' && value.fr ? value.fr : value.en;
}
