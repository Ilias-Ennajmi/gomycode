import type { Localized } from '@/core/i18n/localized';
import type { AccentHeading } from './types';
import { homeContent } from './home';

export const aboutContent = {
  eyebrow: { en: 'About us' } satisfies Localized,
  heading: {
    prefix: { en: 'A small team, ', fr: 'Une petite équipe, ' },
    accent: { en: 'in the scene', fr: 'dans la scène' },
    suffix: { en: '.', fr: '.' },
  } satisfies AccentHeading,
  intro: {
    en: 'Marketers and creators based in Marrakech, working across Morocco, MENA, Europe, Ibiza and Dubai. We take on a limited number of artists and venues at a time, because the work is hands on.',
  } satisfies Localized,

  team: [
    {
      name: 'Yassine Houari',
      role: { en: 'FOUNDER' } satisfies Localized,
      bio: {
        en: 'Runs strategy and client work. Fifteen years around the electronic scene, promoter side and label side.',
      } satisfies Localized,
    },
    {
      name: 'Name to confirm',
      role: { en: 'PAID MEDIA' } satisfies Localized,
      bio: { en: 'Builds and runs the ad accounts. Lives in the numbers, reports in plain language.' } satisfies Localized,
    },
    {
      name: 'Name to confirm',
      role: { en: 'CONTENT' } satisfies Localized,
      bio: { en: 'Shoots and cuts on site. Club light, phone in hand, no crew needed.' } satisfies Localized,
    },
    {
      name: 'Name to confirm',
      role: { en: 'COMMUNITY' } satisfies Localized,
      bio: {
        en: 'Handles the daily presence and the influencer side, in French, English and Darija.',
      } satisfies Localized,
    },
  ],
  teamNote: { en: 'NOTE / names, roles and portraits to be supplied' } satisfies Localized,
  portraitLabel: { en: 'portrait' } satisfies Localized,

  processHeading: { en: 'The process', fr: 'Le process' } satisfies Localized,
  // Unlike the Home "process preview", the full About process section has no
  // French copy on the step titles/bodies in the source design.
  processSteps: [
    {
      step: 'STEP 01',
      title: { en: 'Discovery call' } satisfies Localized,
      body: { en: 'Thirty minutes on the goal, the budget and the date. We say if we are the wrong fit.' } satisfies Localized,
    },
    {
      step: 'STEP 02',
      title: { en: 'Strategy and proposal' } satisfies Localized,
      body: {
        en: 'Channels, creative approach, budget split and the number we are aiming at. One page, no jargon.',
      } satisfies Localized,
    },
    {
      step: 'STEP 03',
      title: { en: 'Campaign execution' } satisfies Localized,
      body: {
        en: 'We build the assets, run the ads and manage the community. You approve creative, we handle the rest.',
      } satisfies Localized,
    },
    {
      step: 'STEP 04',
      title: { en: 'Reporting and iteration' } satisfies Localized,
      body: {
        en: 'A weekly read on spend against results, and a monthly review that decides the next move.',
      } satisfies Localized,
    },
  ],

  faqHeading: { en: 'Questions we get', fr: 'Questions fréquentes' } satisfies Localized,
  faqItems: [
    {
      question: { en: 'What is the minimum budget?' } satisfies Localized,
      answer: {
        en: 'Ad budgets start around 1,500 EUR a month for artists and 2,500 EUR for venues, plus our fee. Below that the data is too thin to optimise on.',
      } satisfies Localized,
    },
    {
      question: { en: 'How long is a typical engagement?' } satisfies Localized,
      answer: {
        en: 'Event campaigns run six to ten weeks. Artist and venue work is monthly, with three months as a sensible first commitment.',
      } satisfies Localized,
    },
    {
      question: { en: 'How many clients do you take at once?' } satisfies Localized,
      answer: {
        en: 'Around eight active accounts. Past that the reporting gets slower and the creative gets generic.',
      } satisfies Localized,
    },
    {
      question: { en: 'Do you work outside Morocco?' } satisfies Localized,
      answer: {
        en: 'Yes. Campaigns have run across MENA, Europe, Ibiza and Dubai. Media buying is remote, content shoots travel.',
      } satisfies Localized,
    },
    {
      question: { en: 'How fast do results show?' } satisfies Localized,
      answer: {
        en: 'Ticket sales move in the first two weeks. Audience and streaming growth needs a full cycle, so judge it at month three.',
      } satisfies Localized,
    },
  ],

  contactHeading: homeContent.contactHeading,
};
