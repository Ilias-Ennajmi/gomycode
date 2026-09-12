import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, DM_Mono, Archivo } from 'next/font/google';
import { themeInitScript } from '@/core/theme';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
});

/**
 * Display face for hero titles and section headings. Fontshare (where a face
 * like "Clash Display" would live) isn't reachable from this environment, so
 * this is the closest Google Fonts equivalent to the client's reference: a
 * heavy, architectural grotesk at black/900 weight.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['800', '900'],
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
    <html lang="en" className={`${inter.variable} ${dmMono.variable} ${archivo.variable}`} suppressHydrationWarning>
      <body>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
