import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading } from './types';

export const creativeContent = {
  eyebrow: { en: 'Creative studio' } satisfies Localized,
  heading: {
    prefix: { en: 'Design and video that ', fr: 'Design et vidéo qui ' },
    accent: { en: 'carry the sound', fr: 'portent le son' },
    suffix: { en: '.', fr: '.' },
  } satisfies AccentHeading,
  intro: {
    en: "Promo videos, socials, artwork, websites and press kits, built for electronic music and the nights around it, not templated for pop.",
  } satisfies Localized,
  ctaPrimary: { en: 'Talk about a project', fr: 'Parlons de votre projet' } satisfies Localized,
  ctaSecondary: { en: 'See the work', fr: 'Voir nos réalisations' } satisfies Localized,

  servicesHeading: { en: 'What we make', fr: 'Ce qu\'on crée' } satisfies Localized,
  services: [
    {
      number: '01',
      heading: { en: 'Promo videos', fr: 'Vidéos promo' } satisfies Localized,
      body: {
        en: "Teaser cuts, lyric-style visualizers and aftermovies, built around a release or a night rather than resized from a template. Cut for the platform they're going on, not exported once and reused everywhere.",
      } satisfies Localized,
    },
    {
      number: '02',
      heading: { en: 'Social media branding', fr: 'Identité réseaux sociaux' } satisfies Localized,
      body: {
        en: 'One visual system across every platform, so a page reads as one artist or one club, not five different accounts run by five different people.',
      } satisfies Localized,
    },
    {
      number: '03',
      heading: { en: 'Website design', fr: 'Création de site web' } satisfies Localized,
      body: {
        en: "Built lean and fast, no fifteen-plugin page builder groaning under its own weight. Technical SEO handled properly from day one — metadata, structured data, sitemaps, Core Web Vitals — the parts most agencies skip because they don't show up in a screenshot. Looks right in the portfolio, performs when a booker or a fan actually searches.",
      } satisfies Localized,
    },
    {
      number: '04',
      heading: { en: 'Artwork design', fr: 'Direction artistique' } satisfies Localized,
      body: {
        en: 'Release artwork, event key visuals and templates residents and labels can reuse without redesigning every week. Consistent enough to be recognised, flexible enough not to look recycled.',
      } satisfies Localized,
    },
  ],

  videoPrev: { en: 'Previous video', fr: 'Vidéo précédente' } satisfies Localized,
  videoNext: { en: 'Next video', fr: 'Vidéo suivante' } satisfies Localized,
  videoPlaceholderLabel: {
    en: 'video — client to supply',
    fr: 'vidéo — à recevoir du client',
  } satisfies Localized,

  contactHeading: {
    en: 'Got a video, a page or an EPK to build?',
    fr: 'Une vidéo, un site ou un EPK à construire ?',
  } satisfies Localized,
};
