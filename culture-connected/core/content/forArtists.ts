import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading, StatItem } from './types';
import type { ServiceIconName } from '@/components/ui/ServiceIcon';

export const forArtistsContent = {
  eyebrow: { en: 'For artists and labels' } satisfies Localized,
  heading: {
    prefix: { en: 'Listeners who stay. Rooms that ', fr: 'Des auditeurs qui restent. Des salles qui ' },
    accent: { en: 'sell out', fr: 'se remplissent' },
    suffix: { en: '.', fr: '.' },
  } satisfies AccentHeading,
  intro: {
    en: 'We run paid media, content and influencer campaigns around releases, tours and long-term audience growth. Every euro is tracked to a save, a stream, a signup or a ticket.',
  } satisfies Localized,
  ctaPrimary: { en: 'Talk about your release', fr: 'Parlons de votre sortie' } satisfies Localized,
  ctaSecondary: { en: 'See the results', fr: 'Voir les résultats' } satisfies Localized,
  mediaLabel: { en: 'artist press shot / live set still' } satisfies Localized,

  handleHeading: { en: 'What we handle', fr: "Ce qu'on gère" } satisfies Localized,
  handleItems: [
    {
      number: '01',
      icon: 'audience' as ServiceIconName,
      heading: { en: 'Audience growth' } satisfies Localized,
      body: {
        en: 'Follower and community growth built on people who already listen to your lane, not bought reach. Lead ads grow first-party fan data ahead of a tour, a release or a merch drop.',
      } satisfies Localized,
    },
    {
      number: '02',
      icon: 'streams' as ServiceIconName,
      heading: { en: 'Ad optimisation for streams' } satisfies Localized,
      body: {
        en: 'Save-to-listener mechanics on Spotify and Beatport: ads pointed at saves, saves converted into monthly listeners.',
      } satisfies Localized,
    },
    {
      number: '03',
      icon: 'release' as ServiceIconName,
      heading: { en: 'Release promotion' } satisfies Localized,
      body: {
        en: 'Pre-save waves, launch-day push, sustain phase. Creative cut for each platform, not resized once.',
      } satisfies Localized,
    },
    {
      number: '04',
      icon: 'touring' as ServiceIconName,
      heading: { en: 'Touring support' } satisfies Localized,
      body: {
        en: "City-by-city campaigns around tour dates, geo-fenced on the venue and the promoter's own audience.",
      } satisfies Localized,
    },
    {
      number: '05',
      icon: 'retarget' as ServiceIconName,
      heading: { en: 'Retargeting' } satisfies Localized,
      body: {
        en: 'Video viewers, profile visitors and site traffic worked a second and third time, at a lower cost.',
      } satisfies Localized,
    },
    {
      number: '06',
      icon: 'lookalike' as ServiceIconName,
      heading: { en: 'Lookalike audiences' } satisfies Localized,
      body: {
        en: 'Built from real listeners and ticket buyers, refreshed as the data set grows through the campaign.',
      } satisfies Localized,
    },
    {
      number: '07',
      icon: 'tickets' as ServiceIconName,
      heading: { en: 'Ticket & merch sales ads' } satisfies Localized,
      body: {
        en: 'Optimised sales ads for show tickets and merchandise, with performance monitored and rebalanced continuously.',
      } satisfies Localized,
    },
    {
      number: '08',
      icon: 'calendar' as ServiceIconName,
      heading: { en: 'Content strategy & planning' } satisfies Localized,
      body: {
        en: 'Monthly content strategy, a weekly posting calendar, ideation support and performance reporting, so there is always a plan behind what goes out.',
      } satisfies Localized,
    },
  ],

  proofHeading: { en: 'Proof', fr: 'Preuves' } satisfies Localized,
  proofNote: { en: 'FROM OUR CLIENT DECK' } satisfies Localized,
  proofStats: [
    {
      value: 2.2,
      decimals: 1,
      suffix: 'M',
      label: { en: 'streams added on one release campaign' },
      sublabel: 'LEVYM × SHIMZA →',
      anchor: 'levym',
    },
    {
      value: 38,
      suffix: 'K',
      label: { en: 'engaged followers in six months' },
      sublabel: 'ENZO SIFFREDI →',
      anchor: 'enzo',
    },
    {
      value: 4.1,
      decimals: 1,
      suffix: 'x',
      label: { en: 'return on a tour announcement push' },
      sublabel: 'ARKADYAN →',
      anchor: 'arkadyan',
    },
  ] satisfies StatItem[],

  contactHeading: { en: 'Got a release or a tour to push?', fr: 'Une sortie ou une tournée à pousser ?' } satisfies Localized,
};
