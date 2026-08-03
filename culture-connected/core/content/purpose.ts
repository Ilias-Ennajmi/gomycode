import type { Localized } from '@/core/i18n/localized';

/**
 * Copy for the oversized-type "Purpose" section. Replaces the streaming
 * mechanic block on For Artists. The headline remixes the accent phrase
 * from the About hero ("in the scene") and the paragraph reuses the About
 * intro verbatim, so this new section states an existing position rather
 * than inventing a fresh brand claim.
 */
export const purposeContent = {
  eyebrow: { en: 'Our purpose' } satisfies Localized,
  headingLines: [
    { en: 'In the scene.', fr: 'Dans la scène.' } satisfies Localized,
    { en: 'Not on the sidelines.', fr: 'Pas sur la touche.' } satisfies Localized,
  ],
  paragraph: {
    en: 'Marketers and creators based in Marrakech, working across Morocco, MENA, Europe, Ibiza and Dubai. We take on a limited number of artists and venues at a time, because the work is hands on.',
  } satisfies Localized,
  cta: { en: 'Learn more about us', fr: 'En savoir plus sur nous' } satisfies Localized,
};
