import type { Localized } from '@/core/i18n/localized';

/**
 * Copy for the global footer. Deliberately smaller than a typical agency
 * footer: no newsletter (the source design brief explicitly rules one out -
 * "No booking calendar, no newsletter") and no invented pages or socials -
 * Instagram is the only real link in the source content.
 */
export const footerCopy = {
  tagline: {
    en: 'London music marketing for touring artists, labels, venues and promoters.',
    fr: 'Marketing musical basé à Londres pour les artistes en tournée, labels, lieux et promoteurs.',
  } satisfies Localized,
  pagesHeading: { en: 'Pages', fr: 'Pages' } satisfies Localized,
  contactHeading: { en: 'Get in touch', fr: 'Contact' } satisfies Localized,
  contactLabel: { en: 'Contact', fr: 'Contact' } satisfies Localized,
  followHeading: { en: 'Follow along', fr: 'Suivez-nous' } satisfies Localized,
  homeLabel: { en: 'Home', fr: 'Accueil' } satisfies Localized,
};
