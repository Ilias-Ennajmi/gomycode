import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading } from './types';

export const homeContent = {
  eyebrow: { en: 'London / Music marketing' } satisfies Localized,
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

  whatWeDoHeading: { en: 'What we do', fr: 'Ce qu’on fait' } satisfies Localized,
  whatWeDo: [
    {
      label: { en: 'Grow' } satisfies Localized,
      bold: { en: 'engaged fanbases' } satisfies Localized,
      rest: { en: 'on social media directly in targeted regions' } satisfies Localized,
    },
    {
      label: { en: 'Optimise' } satisfies Localized,
      bold: { en: 'the conversion rate' } satisfies Localized,
      rest: {
        en: 'between ad views, clicks, profile visits, streams and ticket sales',
      } satisfies Localized,
    },
    {
      label: { en: 'Increase' } satisfies Localized,
      bold: { en: "event ticket sales and artists' live bookings" } satisfies Localized,
      rest: { en: '' } satisfies Localized,
    },
    {
      label: { en: 'Push' } satisfies Localized,
      bold: { en: 'events, new releases and shows' } satisfies Localized,
      rest: { en: 'via paid media, promotion and fan loyalty' } satisfies Localized,
    },
  ],

  proofHeading: { en: 'Proof, in numbers', fr: 'Les preuves, en chiffres' } satisfies Localized,
  proofLink: { en: 'read the case studies →' } satisfies Localized,
  /** Case-study anchors (core/content/caseStudies.ts) that the ProofShowcase Shuffle button cycles through. */
  proofPool: ['umbra', 'levym', 'novak'],

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
      heading: { en: 'Artists supported', fr: 'Artistes accompagnés' } satisfies Localized,
      chips: [
        'R3HAB',
        'Moojo',
        'Awen',
        'Mr. Goodalf',
        'Novak',
        'GHEIST',
        'Arkadyan',
        'Enzo Siffredi',
        'Sunnery James & Ryan Marciano',
        'AJNA',
        'Echonomist',
        'Emanuel Satie',
        'Emmanuel Jal',
        'JAMIIE',
        'MAGA',
        'Maxi Meraki',
        'Notre Dame',
        'Rodriguez Jr.',
        'Samm',
        'Sean Doron',
        'Tim Engelhardt',
      ],
    },
    promoters: {
      eyebrow: { en: 'PROMOTERS & VENUES' } satisfies Localized,
      heading: { en: 'Dancefloors we helped fill', fr: 'Des pistes de danse qu’on a aidé à remplir' } satisfies Localized,
      chips: [
        'Leone',
        'Organika',
        'UMBRA',
        'Eden Nightclub',
        'Beachouse Ibiza',
        'Kyma Beach Dubai',
        'Red House',
        'Ópalo',
        'Superfekta',
        'Amazone Project',
        'Marquee New York',
        'Zona',
        'Avalon Hollywood',
        'Puls',
        'Klein Phönix Istanbul',
        'Late Night Music',
        'Cacao Amor',
        'Nassau',
        'Sound of Africa',
        'AMUR by Caprices Festival',
        'Babouchka',
      ],
    },
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

  processHeading: { en: 'How we work', fr: 'Comment on travaille' } satisfies Localized,
  processLink: { en: 'the full process →' } satisfies Localized,
  processSteps: [
    { step: 'STEP 01', title: { en: 'Discovery call', fr: 'Appel de découverte' } satisfies Localized },
    { step: 'STEP 02', title: { en: 'Strategy and proposal', fr: 'Stratégie et proposition' } satisfies Localized },
    { step: 'STEP 03', title: { en: 'Campaign execution', fr: 'Exécution de campagne' } satisfies Localized },
    { step: 'STEP 04', title: { en: 'Reporting and iteration', fr: 'Reporting et itération' } satisfies Localized },
  ],

  contactHeading: {
    en: "Whatever you're building next, we want in.",
    fr: 'Quel que soit votre prochain projet, on veut en être.',
  } satisfies Localized,
};
