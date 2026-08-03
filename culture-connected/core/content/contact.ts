import type { Localized } from '@/core/i18n/localized';

/** Shared copy for the three-field contact block repeated at the bottom of every page. */
export const contactShared = {
  note: { en: 'Three fields, one reply within a day.', fr: 'Trois champs, une réponse sous 24h.' } satisfies Localized,
  namePlaceholder: { en: 'Name', fr: 'Nom' } satisfies Localized,
  // No French copy for these in the source design (no data-fr / data-fr-ph on them).
  emailPlaceholder: { en: 'Email' } satisfies Localized,
  messagePlaceholder: { en: 'Message' } satisfies Localized,
  sendButton: { en: 'Send', fr: 'Envoyer' } satisfies Localized,
  // site.js hardcodes these two strings in English regardless of language.
  fillAllFieldsMessage: 'Fill in all three fields.',
  sentMessage: 'Sent. We reply within a day.',
};

export const footerContent = {
  domain: 'cultureconnected.agency',
  city: 'Marrakech',
  instagramHandle: '@cultureconnected_',
  instagramUrl: 'https://instagram.com/cultureconnected_',
};
