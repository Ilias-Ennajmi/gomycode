import type { Localized } from '@/core/i18n/localized';

/** Shared copy for the three-field contact block repeated at the bottom of every page. */
export const contactShared = {
  note: { en: 'Three fields. One reply within a day.', fr: 'Trois champs. Une réponse sous 24h.' } satisfies Localized,
  namePlaceholder: { en: 'Name', fr: 'Nom' } satisfies Localized,
  roleLabel: { en: 'I am:', fr: 'Je suis :' } satisfies Localized,
  roleOptions: [
    { value: 'artist', label: { en: 'An artist', fr: 'Un artiste' } satisfies Localized },
    { value: 'label', label: { en: 'A label', fr: 'Un label' } satisfies Localized },
    { value: 'promoter', label: { en: 'A promoter', fr: 'Un promoteur' } satisfies Localized },
    { value: 'venue', label: { en: 'A venue', fr: 'Un lieu' } satisfies Localized },
  ],
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
  city: 'London',
  email: 'team@cultureconnected.agency',
  phone: '+44 78 2588 9731',
  instagramHandle: '@cultureconnected_',
  instagramUrl: 'https://instagram.com/cultureconnected_',
};
