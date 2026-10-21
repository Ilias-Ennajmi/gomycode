import type { MetadataRoute } from 'next';
import { locales, defaultLocale } from '@/core/i18n/config';
import { navItems } from '@/core/content/nav';

const BASE_URL = 'https://cultureconnected.agency';

/** Every real route (nav pages + Blog, which sits outside navItems as a utility link in Header.tsx). */
const paths = Array.from(new Set([...navItems.map((item) => item.href), '/blog']));

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => {
    const suffix = path === '/' ? '' : path;
    return {
      url: `${BASE_URL}/${defaultLocale}${suffix}`,
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(locales.map((locale) => [locale, `${BASE_URL}/${locale}${suffix}`])),
      },
    };
  });
}
