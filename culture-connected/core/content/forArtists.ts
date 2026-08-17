import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading } from './types';

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

  handleHeading: { en: 'What we handle', fr: "Ce qu'on gère" } satisfies Localized,
  handlePrev: { en: 'Previous service', fr: 'Service précédent' } satisfies Localized,
  handleNext: { en: 'Next service', fr: 'Service suivant' } satisfies Localized,
  heroPrev: { en: 'Previous artist', fr: 'Artiste précédent' } satisfies Localized,
  heroNext: { en: 'Next artist', fr: 'Artiste suivant' } satisfies Localized,
  handleItems: [
    {
      number: '01',
      heading: { en: 'Audience growth' } satisfies Localized,
      body: {
        en: 'Follower and community growth built on people who already listen to your lane, not bought reach. Lead ads grow first-party fan data ahead of a tour, a release or a merch drop.',
      } satisfies Localized,
    },
    {
      number: '02',
      heading: { en: 'Release promotion' } satisfies Localized,
      body: {
        en: 'Pre-save waves, launch-day push, sustain phase. Creative cut for each platform, not resized once.',
      } satisfies Localized,
    },
    {
      number: '03',
      heading: { en: 'Touring support' } satisfies Localized,
      body: {
        en: "City-by-city campaigns around tour dates, geo-fenced on the venue and the promoter's own audience.",
      } satisfies Localized,
    },
    {
      number: '04',
      heading: { en: 'Ticket sales ads' } satisfies Localized,
      body: {
        en: 'Sales ads for show tickets, run around the event promotion itself and rebalanced continuously as the date gets closer.',
      } satisfies Localized,
    },
    {
      number: '05',
      heading: { en: 'Content strategy & planning' } satisfies Localized,
      body: {
        en: 'Monthly content strategy, a weekly posting calendar, ideation support and performance reporting, so there is always a plan behind what goes out.',
      } satisfies Localized,
    },
  ],

  proofHeading: { en: 'Proof', fr: 'Preuves' } satisfies Localized,
  proofNote: { en: 'FROM OUR CLIENT DECK' } satisfies Localized,
  /** Case-study anchors (core/content/caseStudies.ts) the ProofShowcase Shuffle button cycles through. */
  proofPool: ['levym', 'arkadyan'],

  labelsHeading: { en: 'Labels we supported', fr: 'Labels qu’on a accompagnés' } satisfies Localized,

  spotifyHeading: { en: 'On repeat', fr: 'En boucle' } satisfies Localized,
  spotifyNote: {
    en: 'Playlist embed coming — client to supply the Spotify playlist link.',
    fr: 'Playlist à venir — lien Spotify à recevoir du client.',
  } satisfies Localized,
  /** Real Spotify playlist URL not supplied yet; leave null until the client provides one. */
  spotifyPlaylistUrl: null as string | null,

  contactHeading: { en: 'Got a release or a tour to push?', fr: 'Une sortie ou une tournée à pousser ?' } satisfies Localized,
};
