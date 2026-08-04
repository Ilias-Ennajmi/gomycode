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
  posts: [
    { category: { en: 'STRATEGY' } satisfies Localized, titleLabel: { en: 'Post title placeholder' } satisfies Localized },
    { category: { en: 'PLATFORMS' } satisfies Localized, titleLabel: { en: 'Post title placeholder' } satisfies Localized },
    { category: { en: 'CASE NOTES' } satisfies Localized, titleLabel: { en: 'Post title placeholder' } satisfies Localized },
  ],
  dateLabel: 'TBC',
  imageLabel: { en: 'post cover' } satisfies Localized,
  noteLabel: { en: 'NOTE / posts to be added' } satisfies Localized,

  contactHeading: { en: 'Got a story worth writing up?', fr: 'Une histoire à raconter ?' } satisfies Localized,
};
