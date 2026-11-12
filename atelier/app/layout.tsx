import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";
import { ThemeSync } from "@/components/ThemeSync";
import { BRAND, THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "Atelier", template: "%s · Atelier" },
  description: "A private, offline-first moodboard canvas.",
  applicationName: "Atelier",
  // The manifest (app/manifest.ts) is linked automatically.
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Atelier", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.paper },
    { media: "(prefers-color-scheme: dark)", color: BRAND.paperDark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <ThemeSync />
        <RegisterSW />
      </body>
    </html>
  );
}
