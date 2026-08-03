'use client';

import { useEffect } from 'react';
import type { Locale } from '@/lib/i18n/config';

/** Only the true root layout can render <html>, so the locale segment sets `lang` after mount. */
export function SetHtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
