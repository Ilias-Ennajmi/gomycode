import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading, StatItem } from './types';

export interface CaseStudy {
  anchor: string;
  index: string;
  category: string;
  name: string;
  summary: Localized;
  imageLabel: Localized;
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
    en: 'Six campaigns, artist and venue side. Figures below are placeholders until the final deck data is confirmed.',
  } satisfies Localized,
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
    anchor: 'reyou',
    index: '03',
    category: 'ARTIST',
    name: 'Re.You',
    summary: { en: 'Streams bought properly, then kept.' },
    imageLabel: { en: 'release artwork' },
    objective: { en: 'Push a release into algorithmic rotation instead of buying a spike that dies in a week.' },
    whatWeDid: {
      en: 'Ads optimised for saves rather than clicks, run through the pre-save window and the two weeks after. Saves fed release radar, which carried the track further than the paid reach did.',
    },
    stats: [
      { value: 1.2, decimals: 1, suffix: 'M', label: { en: 'streams in the campaign window' } },
      { value: 64, suffix: '%', label: { en: 'from algorithmic playlists' } },
      { value: 2.8, decimals: 1, suffix: 'x', label: { en: 'monthly listeners, before to after' } },
    ],
  },
  {
    anchor: 'umbra',
    index: '04',
    category: 'EVENT',
    name: 'Umbra Dance',
    summary: { en: 'A list built before the tickets existed.' },
    imageLabel: { en: 'event key visual' },
    objective: { en: 'Sell out a first edition with no existing audience and no name recognition.' },
    whatWeDid: {
      en: 'Signup ads for six weeks before announcement, segmented by city and by which lineup teaser they reacted to. Email at drop, then retargeting on everyone who opened but did not buy.',
    },
    stats: [
      { value: 12, suffix: 'K', label: { en: 'signups pre-announcement' } },
      { value: 72, suffix: '%', label: { en: 'of capacity sold in week one' } },
      { value: 1.8, decimals: 1, prefix: '€', label: { en: 'cost per ticket sold' } },
    ],
  },
  {
    anchor: 'eden',
    index: '05',
    category: 'VENUE',
    name: 'Eden Nightclub',
    summary: { en: 'Weekly programme, weekly numbers.' },
    imageLabel: { en: 'club night footage' },
    objective: { en: 'Hold a consistent fill rate through the season, including the weeks without a headline booking.' },
    whatWeDid: {
      en: 'Always-on reach around the club, spiking 72 hours before each night. Guest-list ads pointed at a signup, then a weekly mail to the list. Conversion tracked to the ticketing platform, spend rebalanced every Monday.',
    },
    stats: [
      { value: 6.4, decimals: 1, suffix: 'x', label: { en: 'return on ad spend' } },
      { value: 18, suffix: 'K', label: { en: 'tickets across the season' } },
      { value: 24, suffix: '%', label: { en: 'lower cost per ticket vs prior season' } },
    ],
  },
  {
    anchor: 'leone',
    index: '06',
    category: 'POINT OF SALE',
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
