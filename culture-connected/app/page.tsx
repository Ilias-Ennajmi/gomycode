import { redirect } from 'next/navigation';
import { defaultLocale } from '@/core/i18n/config';

/**
 * Static export has no server to inspect Accept-Language at request time,
 * so the root path always resolves to the default locale (matches the
 * README's documented fallback for the missing Accept-Language detection).
 */
export default function RootPage() {
  redirect(`/${defaultLocale}`);
}
