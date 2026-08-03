import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sora, DM_Mono } from 'next/font/google';
import { themeInitScript } from '@/lib/theme';
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

export const metadata: Metadata = {
  title: 'culture connected',
  description:
    'Culture Connected is a Marrakech music marketing agency working with touring electronic and urban artists, labels, nightlife venues and event promoters.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <body>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
