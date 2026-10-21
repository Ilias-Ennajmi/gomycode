import type { Localized } from '@/core/i18n/localized';

export interface NavItem {
  href: string;
  label: Localized;
}

export const navItems: NavItem[] = [
  { href: '/', label: { en: 'Home', fr: 'Accueil' } },
  { href: '/for-artists', label: { en: 'For artists', fr: 'Artistes' } },
  { href: '/for-promoters', label: { en: 'For promoters', fr: 'Promoteurs' } },
  { href: '/creative', label: { en: 'Creative', fr: 'Créa' } },
  { href: '/case-studies', label: { en: 'Case studies', fr: 'Études de cas' } },
  { href: '/about', label: { en: 'About', fr: 'À propos' } },
];

export const contactNavLabel: Localized = { en: 'Contact', fr: 'Contact' };
export const blogNavLabel: Localized = { en: 'Blog', fr: 'Blog' };

export const wordmark = 'culture connected';
