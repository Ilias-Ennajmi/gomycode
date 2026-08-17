import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading } from './types';

export const forPromotersContent = {
  eyebrow: { en: 'Venues, clubs, restaurants, festivals' } satisfies Localized,
  heading: {
    prefix: { en: 'Fill the room. Every week, or for one ', fr: 'Remplir la salle. Chaque semaine, ou pour une ' },
    accent: { en: 'date', fr: 'date' },
    suffix: { en: '.', fr: '.' },
  } satisfies AccentHeading,
  intro: {
    en: 'Two different jobs sit under the same roof. A venue builds notoriety and a steady fill rate. An event sells a fixed number of tickets in a fixed window. We run both, and we do not run them the same way.',
  } satisfies Localized,
  ctaVenue: { en: 'Venue objective', fr: 'Objectif lieu' } satisfies Localized,
  ctaEvent: { en: 'Event objective', fr: 'Objectif event' } satisfies Localized,

  venueTypesLabel: { en: 'WHO THIS IS FOR', fr: 'POUR QUI' } satisfies Localized,
  venueTypes: ['Clubs', 'Festivals', 'Restaurants & nights', 'Promoters', 'Tour stops'],

  objectiveA: {
    eyebrow: { en: 'OBJECTIVE A / ONGOING' } satisfies Localized,
    heading: { en: 'Notoriety and fill rate', fr: 'Notoriété et taux de remplissage' } satisfies Localized,
    body: {
      en: 'For clubs, restaurants running events and any room with a weekly programme. The point is to be the obvious choice on a Friday, not to win one night.',
    } satisfies Localized,
    rows: [
      {
        number: '01',
        title: { en: 'Content strategy' } satisfies Localized,
        body: { en: 'A shooting rhythm that matches the programme, so there is always something to post.' } satisfies Localized,
      },
      {
        number: '02',
        title: { en: 'Community management' } satisfies Localized,
        body: { en: 'Daily presence, guest reposts, DMs answered like a host and not a brand.' } satisfies Localized,
      },
      {
        number: '03',
        title: { en: 'Always-on social ads' } satisfies Localized,
        body: { en: 'A low, constant spend on reach around the venue, spiking before each night.' } satisfies Localized,
      },
      {
        number: '04',
        title: { en: 'Visual identity' } satisfies Localized,
        body: { en: 'Artwork templates for residents and guests, recognisable in a crowded feed.' } satisfies Localized,
      },
    ],
  },

  objectiveB: {
    eyebrow: { en: 'OBJECTIVE B / CAMPAIGN WINDOW' } satisfies Localized,
    heading: { en: 'Sell tickets, inside the window', fr: 'Vendre des billets, dans la fenêtre' } satisfies Localized,
    body: {
      en: 'For one-off events, festivals and tour dates. Fixed capacity, fixed deadline, one number that matters.',
    } satisfies Localized,
    rows: [
      {
        number: '01',
        title: { en: 'Pre-signup ad wave' } satisfies Localized,
        body: { en: 'Collect emails before tickets go live, then segment and mail the list at drop.' } satisfies Localized,
      },
      {
        number: '02',
        title: { en: 'Geo-fenced targeting' } satisfies Localized,
        body: { en: 'Radius around the venue plus the feeder cities that actually travel for it.' } satisfies Localized,
      },
      {
        number: '03',
        title: { en: 'Retargeting waves' } satisfies Localized,
        body: { en: 'Video viewers and checkout drop-offs worked again as the date gets close.' } satisfies Localized,
      },
      {
        number: '04',
        title: { en: 'Influencer activation' } satisfies Localized,
        body: {
          en: 'Local voices with real pull in the scene, briefed on the night and not on the brand.',
        } satisfies Localized,
      },
      {
        number: '05',
        title: { en: 'Conversion tracking' } satisfies Localized,
        body: { en: 'Pixel and ticketing platform wired together, so spend is read against sales daily.' } satisfies Localized,
      },
    ],
  },

  tacticsHeading: { en: 'Campaigns that deliver results', fr: 'Des campagnes qui livrent des résultats' } satisfies Localized,
  tacticsIntro: { en: "We're not out here just boosting posts.", fr: 'On ne se contente pas de booster des posts.' } satisfies Localized,
  tactics: [
    {
      number: '01',
      body: { en: "Re-targeting people who've visited your page but didn't follow" } satisfies Localized,
    },
    {
      number: '02',
      body: { en: "Targeting people who've visited the venue you're playing at in the last 3 months" } satisfies Localized,
    },
    {
      number: '03',
      body: { en: "Tracking fans' actions after an ad click: add to cart, ticket bought, and everything between" } satisfies Localized,
    },
    {
      number: '04',
      body: {
        en: 'Collecting signups through ads, feeding them into an email tool segmented by city, then notifying fans the moment you play there',
      } satisfies Localized,
    },
    {
      number: '05',
      body: { en: "Building lookalike audiences from people who clicked a previous ad or joined a guestlist" } satisfies Localized,
    },
    {
      number: '06',
      body: { en: 'Running email campaigns to fans already subscribed to similar artists' } satisfies Localized,
    },
  ],

  reportHeading: { en: 'What we report on', fr: "Ce qu'on suit" } satisfies Localized,
  reportItems: [
    {
      title: { en: 'Cost per ticket' } satisfies Localized,
      body: { en: 'Against face value, per channel, per creative.' } satisfies Localized,
    },
    {
      title: { en: 'Fill rate over time' } satisfies Localized,
      body: { en: 'Week on week, so the programme can be adjusted early.' } satisfies Localized,
    },
    {
      title: { en: 'Signups collected' } satisfies Localized,
      body: { en: 'An owned list that lowers the cost of the next date.' } satisfies Localized,
    },
    {
      title: { en: 'Return on ad spend' } satisfies Localized,
      body: { en: 'Tracked to the ticketing platform, not to platform-reported clicks.' } satisfies Localized,
    },
  ],

  proofHeading: { en: 'Proof', fr: 'Preuves' } satisfies Localized,
  proofNote: { en: 'FROM OUR CLIENT DECK' } satisfies Localized,
  /** Case-study anchors (core/content/caseStudies.ts) the ProofShowcase Shuffle button cycles through. */
  proofPool: ['umbra', 'eden', 'leone'],

  venuesHeading: { en: 'Events and venues we’ve worked with', fr: 'Events et lieux avec qui on a travaillé' } satisfies Localized,
  venuesNote: {
    en: 'Just a selection — we currently support 30+ touring artists, record labels, venues and music festivals.',
  } satisfies Localized,
  venuesPrev: { en: 'Previous venue', fr: 'Lieu précédent' } satisfies Localized,
  venuesNext: { en: 'Next venue', fr: 'Lieu suivant' } satisfies Localized,

  eventsHeading: { en: 'Nights, in motion', fr: 'Des soirées, en mouvement' } satisfies Localized,
  eventsPrev: { en: 'Previous event', fr: 'Événement précédent' } satisfies Localized,
  eventsNext: { en: 'Next event', fr: 'Événement suivant' } satisfies Localized,
  eventsPlaceholderLabel: { en: 'event photo — client to supply', fr: 'photo événement — à recevoir du client' } satisfies Localized,

  contactHeading: { en: 'A date, a season, a room?', fr: 'Une date, une saison, un lieu ?' } satisfies Localized,
};
