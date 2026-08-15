import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sora, DM_Mono, Bricolage_Grotesque } from 'next/font/google';
import { themeInitScript } from '@/core/theme';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
});

/**
 * Display face for hero titles and section headings. Fontshare's "Clash
 * Display" (the reference the client pointed at) isn't reachable from this
 * environment and isn't published on Google Fonts/npm, so this is the
 * closest available substitute: a heavy, tight-tracked display grotesk.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const title = 'culture connected';
const description =
  'Culture Connected is a London music marketing agency working with touring electronic and urban artists, labels, nightlife venues and event promoters internationally.';

export const metadata: Metadata = {
  metadataBase: new URL('https://cultureconnected.agency'),
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: title,
    url: '/',
    type: 'website',
    images: [{ url: '/case-studies/umbra-marrakech.jpg', width: 1200, height: 1500 }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/case-studies/umbra-marrakech.jpg'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${dmMono.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
