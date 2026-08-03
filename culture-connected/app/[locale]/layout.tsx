import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { locales, isLocale, type Locale } from '@/core/i18n/config';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { SetHtmlLang } from './SetHtmlLang';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: ReactNode;
  params: { locale: string };
}

export default function LocaleLayout({ children, params }: LocaleLayoutProps) {
  if (!isLocale(params.locale)) notFound();
  const locale: Locale = params.locale;

  return (
    <>
      <SetHtmlLang locale={locale} />
      <Header locale={locale} />
      {children}
      <Footer locale={locale} />
    </>
  );
}
