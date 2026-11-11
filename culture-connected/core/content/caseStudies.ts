import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading, StatItem } from './types';

export interface CaseStudy {
  anchor: string;
  index: string;
  category: string;
  /** Which roster half this client sits in, matching the Home page roster split. */
  side: 'artist' | 'promoter';
  name: string;
  summary: Localized;
  imageLabel: Localized;
  /** Real campaign photo from the client deck, when we have one. Falls back to PlaceholderPanel when absent. */
  image?: string;
  objective: Localized;
  whatWeDid: Localized;
  stats: StatItem[];
}

export const caseStudiesPageContent = {
  eyebrow: { en: 'Case studies' } satisfies Localized,
  heading: {
    prefix: { en: 'Objective, execution, ', fr: 'Objectif, exécution, ' },
    accent: { en: 'numbers', fr: 'chiffres' },
    suffix: { en: '.', fr: '.' },
  } satisfies AccentHeading,
  intro: {
    en: 'Artist and venue side, real figures from our client reporting.',
  } satisfies Localized,
  readMoreLabel: { en: 'Read more', fr: 'Lire la suite' } satisfies Localized,
  readLessLabel: { en: 'Read less', fr: 'Réduire' } satisfies Localized,
  contactHeading: {
    en: 'The next one could be yours.',
    fr: "Le prochain cas, c'est peut-être le vôtre.",
  } satisfies Localized,
};

export const caseStudies: CaseStudy[] = [
  {
    anchor: 'enzo',
    index: '01',
    category: 'ARTIST',
    side: 'artist',
    name: 'Enzo Siffredi',
    summary: { en: 'Follower growth that translates into gig demand.' },
    imageLabel: { en: 'campaign creative' },
    objective: {
      en: 'Build a real audience around a rising name, in the markets where he was already getting booked.',
    },
    whatWeDid: {
      en: 'Six months of always-on social ads against listeners of adjacent artists, cut from live footage rather than studio content. Every viewer over three seconds went into a retargeting pool and got the next drop first.',
    },
    stats: [
      { value: 38, suffix: 'K', label: { en: 'engaged followers added' } },
      { value: 0.04, decimals: 2, prefix: '€', label: { en: 'cost per engagement' } },
      { value: 6, label: { en: 'months, always on' } },
    ],
  },
  {
    anchor: 'arkadyan',
    index: '02',
    category: 'ARTIST',
    side: 'artist',
    name: 'Arkadyan',
    summary: { en: 'A tour announcement worked city by city.' },
    imageLabel: { en: 'tour poster / date list' },
    objective: {
      en: 'Move tickets across a multi-city run without burning budget in cities that were already selling.',
    },
    whatWeDid: {
      en: 'One campaign per city, budgets rebalanced weekly against real sales from the ticketing platform. Lookalikes built from previous buyers, plus a retargeting wave in the final ten days.',
    },
    stats: [
      { value: 4.1, decimals: 1, suffix: 'x', label: { en: 'return on ad spend' } },
      { value: 9, label: { en: 'cities campaigned' } },
      { value: 31, suffix: '%', label: { en: 'of sales from retargeting' } },
    ],
  },
  {
    anchor: 'levym',
    index: '03',
    category: 'ARTIST',
    side: 'artist',
    name: 'LevyM × Shimza',
    summary: { en: 'A release push that outlived the campaign window.' },
    imageLabel: { en: 'live show footage' },
    image: '/case-studies/levym-shimza.jpg',
    objective: { en: "Carry LevyM's collaboration with Shimza, “No Shape Without You,” past the release-weekend spike." },
    whatWeDid: {
      en: 'An Instagram ads campaign launched immediately after release weekend, cut from studio footage of LevyM making the track and playing it live with instruments in his shows.',
    },
    stats: [
      { value: 873, suffix: 'K', label: { en: 'streams in 64 days' } },
      { value: 0.19, decimals: 2, prefix: '€', label: { en: 'cost per conversion to Spotify' } },
      { value: 2.2, decimals: 1, suffix: 'M', label: { en: 'streams reached in 150 days' } },
    ],
  },
  {
    anchor: 'novak',
    index: '04',
    category: 'ARTIST',
    side: 'artist',
    name: 'Novak',
    summary: { en: "Reigniting a release a month after it dropped." },
    imageLabel: { en: 'artist portrait' },
    image: '/case-studies/novak.jpg',
    objective: {
      en: "Add momentum to Novak's release “Sippin'” on Francis Mercier's label Deep Root Tribe, after its initial release-day hype had faded.",
    },
    whatWeDid: {
      en: 'A mix of high-definition studio and live-show content on Instagram, plus support videos from other DJs playing the track live, including Mahmut Orhan, Francis Mercier, and Sunnery James & Ryan Marciano.',
    },
    stats: [
      { value: 310, suffix: 'K', label: { en: 'streams added in 28 days' } },
      { value: 0.11, decimals: 2, prefix: '€', label: { en: 'cost per conversion, US/EU/Canada' } },
      { value: 137, suffix: 'K', label: { en: 'new listeners generated' } },
    ],
  },
  {
    anchor: 'gheist',
    index: '05',
    category: 'ARTIST',
    side: 'artist',
    name: 'GHEIST',
    summary: { en: 'A remix pushed while the pre-save momentum was still hot.' },
    imageLabel: { en: 'artist portrait' },
    image: '/case-studies/gheist.jpg',
    objective: {
      en: 'Keep the momentum on GHEIST’s remix of Rüfüs Du Sol’s "In the Moment," which already had strong pre-saves on day one.',
    },
    whatWeDid: {
      en: 'An Instagram and TikTok ad campaign built from GHEIST live-performance videos playing the remix to fans, sending viewers straight to Spotify.',
    },
    stats: [
      { value: 220, suffix: 'K', label: { en: 'streams in 20 days' } },
      { value: 10, suffix: 'K', label: { en: 'saves and playlist adds generated' } },
      { value: 132, suffix: 'K', label: { en: 'listeners reached' } },
    ],
  },
  {
    anchor: 'umbra',
    index: '06',
    category: 'EVENT',
    side: 'promoter',
    name: 'Umbra Marrakech',
    summary: { en: 'Tickets sold before the door opened, tracked to the euro.' },
    imageLabel: { en: 'event key visual' },
    image: '/case-studies/umbra-marrakech.jpg',
    objective: { en: 'Turn Instagram reach into direct ticket sales across summer and winter events in Marrakech and Tamuda Bay.' },
    whatWeDid: {
      en: 'Pre-signup ad campaigns ahead of ticket launch, cold-audience add-to-cart ads, and retargeting waves on warm audiences, all tracked through to the ticketing platform. Average CPM landed at €0.55 per 1,000 reached with CPC as low as €0.04 — advertising cost ran as low as €2.50 per ticket sold through retargeting, €8.50 blended across cold and warm audiences.',
    },
    stats: [
      { value: 19.8, decimals: 1, suffix: 'x', label: { en: 'ROAS, 3 summer events' } },
      { value: 11, suffix: 'x', label: { en: 'ROAS, 4 winter events' } },
      { value: 450, label: { en: 'tickets sold immediately on launch' } },
      { value: 80, suffix: '%', label: { en: 'of tickets attributed to Instagram ads' } },
    ],
  },
  {
    anchor: 'eden',
    index: '07',
    category: 'VENUE',
    side: 'promoter',
    name: 'Eden Nightclub',
    summary: { en: 'A winter season built around advance sales, not door sales.' },
    imageLabel: { en: 'club night footage' },
    image: '/case-studies/eden-nightclub.jpg',
    objective: { en: 'Capitalise on the winter festive season in Marrakech to maximise ticket sales and event attendance.' },
    whatWeDid: {
      en: 'A curated visual identity for Eden Marrakech to make its content instantly identifiable on Instagram, paired with ads targeted at Marrakech locals, Casablanca visitors and foreign tourists in the city. Table reservation inquiries increased alongside link clicks, up 136% to 10.7K, and profile visits, up 69.8% to 17.8K.',
    },
    stats: [
      { value: 40, suffix: '%', label: { en: 'more tickets sold in advance' } },
      { value: 2.5, decimals: 1, suffix: 'K', label: { en: 'followers added in one month' } },
      { value: 529.5, decimals: 1, suffix: 'K', label: { en: 'reach, +18.2% on the prior period' } },
      { value: 231, suffix: '%', label: { en: 'more follows' } },
    ],
  },
  {
    anchor: 'leone',
    index: '08',
    category: 'POINT OF SALE',
    side: 'promoter',
    name: 'Leone',
    summary: { en: 'A restaurant that became a music address.' },
    imageLabel: { en: 'venue content grid' },
    objective: {
      en: "Turn a weekly DJ slot into a reason to book a table, without breaking the restaurant's own identity.",
    },
    whatWeDid: {
      en: 'A content rhythm shot on site every fortnight, artwork templates for the residents, and a small always-on ad budget aimed at a tight radius plus tourists arriving that week.',
    },
    stats: [
      { value: 3, suffix: 'x', label: { en: 'covers on event nights' } },
      { value: 47, suffix: '%', label: { en: 'audience growth in a season' } },
      { value: 26, label: { en: 'nights programmed and promoted' } },
    ],
  },
];
