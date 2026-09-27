import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading } from './types';

export const blogContent = {
  eyebrow: { en: 'Blog' } satisfies Localized,
  heading: {
    prefix: { en: 'Notes from the ', fr: 'Des nouvelles de la ' },
    accent: { en: 'scene', fr: 'scène' },
    suffix: { en: '.', fr: '.' },
  } satisfies AccentHeading,
  intro: {
    en: 'Release strategy, platform changes and campaign breakdowns, written up as we run them, not recycled from someone else\'s newsletter.',
  } satisfies Localized,

  postsHeading: { en: 'Recent posts', fr: 'Derniers articles' } satisfies Localized,
  comingSoonHeading: { en: 'First posts are in the works.', fr: 'Les premiers articles arrivent bientôt.' } satisfies Localized,
  comingSoonBody: {
    en: "We're writing up the campaigns we're running right now rather than backdating old ones. Check back soon, or follow along on Instagram in the meantime.",
    fr: "On écrit sur les campagnes qu'on mène en ce moment plutôt que d'antidater d'anciennes campagnes. Repassez bientôt, ou suivez-nous sur Instagram en attendant.",
  } satisfies Localized,

  contactHeading: { en: 'Got a story worth writing up?', fr: 'Une histoire à raconter ?' } satisfies Localized,
};
