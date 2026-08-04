import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading, StatItem } from './types';

export const homeContent = {
  eyebrow: { en: 'Marrakech / Music marketing' } satisfies Localized,
  heading: {
    prefix: { en: 'We fill rooms and ', fr: 'On remplit les salles et on ' },
    accent: { en: 'stack streams', fr: 'empile les streams' },
    suffix: { en: '.', fr: '.' },
    highlight: true,
  } satisfies AccentHeading,
  intro: {
    en: 'Paid media, content and influencer work for touring artists, labels and the venues that book them.',
    fr: 'Publicité, contenu et influence pour les artistes en tournée, les labels et les lieux qui les programment.',
  } satisfies Localized,
  ctaPrimary: { en: "I'm an artist or label", fr: 'Je suis artiste ou label' } satisfies Localized,
  ctaSecondary: { en: 'I run events or a venue', fr: "J'organise des events ou je gère un lieu" } satisfies Localized,
  heroMediaLabel: { en: 'looping event footage / muted, 12s cut' } satisfies Localized,

  pillarsHeading: { en: "Four things we're good at", fr: "Quatre choses qu'on fait bien" } satisfies Localized,
  pillars: [
    {
      marker: 'circle-red',
      heading: { en: 'Growing fanbases that stick' } satisfies Localized,
      body: {
        en: 'Targeting built from real listeners and buyers, not broad interest guesses.',
      } satisfies Localized,
    },
    {
      marker: 'square-inv',
      heading: { en: 'Turning spend into streams' } satisfies Localized,
      body: { en: 'Save-to-listener mechanics, tracked all the way through to plays.' } satisfies Localized,
    },
    {
      marker: 'ring-red',
      heading: { en: 'Retargeting the whole funnel' } satisfies Localized,
      body: {
        en: 'Geo-fenced around the venue, warm audiences worked until they convert.',
      } satisfies Localized,
    },
    {
      marker: 'diamond-red',
      heading: { en: 'Pushing releases and dates' } satisfies Localized,
      body: { en: 'Campaign windows around a drop, a tour leg or a weekly night.' } satisfies Localized,
    },
  ] as const,

  proofHeading: { en: 'Proof, in numbers', fr: 'Les preuves, en chiffres' } satisfies Localized,
  proofLink: { en: 'read the case studies →' } satisfies Localized,
  proofStats: [
    {
      value: 6.4,
      decimals: 1,
      suffix: 'x',
      label: { en: 'ROAS on a ticketing campaign' },
      sublabel: 'EDEN NIGHTCLUB',
      anchor: 'eden',
    },
    {
      value: 1.2,
      decimals: 1,
      suffix: 'M',
      label: { en: 'streams from one release push' },
      sublabel: 'RE.YOU',
      anchor: 'reyou',
    },
    {
      value: 38,
      suffix: 'K',
      label: { en: 'engaged followers added' },
      sublabel: 'ENZO SIFFREDI',
      anchor: 'enzo',
    },
  ] satisfies StatItem[],

  serviceWords: [
    'PAID MEDIA',
    'CONTENT STRATEGY',
    'INFLUENCER',
    'RELEASE CAMPAIGNS',
    'TICKET SALES',
    'COMMUNITY',
    'TOUR SUPPORT',
  ],

  roster: {
    artists: {
      eyebrow: { en: 'ARTISTS' } satisfies Localized,
      heading: { en: 'On tour, on repeat', fr: 'En tournée, en boucle' } satisfies Localized,
      chips: [
        'R3HAB',
        'Moojo',
        'Awen',
        'Mr. Goodalf',
        'Novak',
        'GHEIST',
        'Arkadyan',
        'Enzo Siffredi',
        'Re.You',
        'Sunnery James & Ryan Marciano',
      ],
    },
    promoters: {
      eyebrow: { en: 'PROMOTERS & VENUES' } satisfies Localized,
      heading: { en: 'Doors open, rooms full', fr: 'Portes ouvertes, salles pleines' } satisfies Localized,
      chips: ['Leone', 'Organika', 'Umbra Dance', 'Eden', 'Beachouse Ibiza', 'Kyma Beach', 'Red House'],
    },
    moreLabel: { en: '+ MORE TBC' } satisfies Localized,
  },

  workHeading: { en: 'Recent work', fr: 'Travaux récents' } satisfies Localized,
  workFilters: {
    all: { en: 'All', fr: 'Tout' } satisfies Localized,
    artist: { en: 'Artists', fr: 'Artistes' } satisfies Localized,
    promoter: { en: 'Promoters', fr: 'Promoteurs' } satisfies Localized,
  },
  workLink: { en: 'all case studies →' } satisfies Localized,
  workPrev: { en: 'Previous case studies', fr: 'Études de cas précédentes' } satisfies Localized,
  workNext: { en: 'Next case studies', fr: 'Études de cas suivantes' } satisfies Localized,

  processHeading: { en: 'How it goes', fr: 'Comment ça se passe' } satisfies Localized,
  processLink: { en: 'the full process →' } satisfies Localized,
  processSteps: [
    { step: 'STEP 01', title: { en: 'Discovery call', fr: 'Appel de découverte' } satisfies Localized },
    { step: 'STEP 02', title: { en: 'Strategy and proposal', fr: 'Stratégie et proposition' } satisfies Localized },
    { step: 'STEP 03', title: { en: 'Campaign execution', fr: 'Exécution de campagne' } satisfies Localized },
    { step: 'STEP 04', title: { en: 'Reporting and iteration', fr: 'Reporting et itération' } satisfies Localized },
  ],

  contactHeading: {
    en: "Say what you're working on.",
    fr: 'Dites-nous sur quoi vous travaillez.',
  } satisfies Localized,
};
