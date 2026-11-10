import type { Metadata, Viewport } from "next";
import { Manrope, Rubik } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { NativeBoot } from "@/components/shell/NativeBoot";
import { ToastProvider } from "@/components/ui/Toast";
import { PREPAINT_SCRIPT } from "@/lib/theme/appearance";
import { BRAND } from "@/lib/theme/brand";
import "@/styles/globals.css";

// Rubik: heavy, softly rounded grotesk for headlines. Manrope: very legible body text.
const rubik = Rubik({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-rubik", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Stash", template: "%s · Stash" },
  description: "Save reels, watch them, remember them, use them.",
  applicationName: "Stash",
  appleWebApp: { capable: true, title: "Stash", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: "/icons/icon-192.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.backgroundLight },
    { media: "(prefers-color-scheme: dark)", color: BRAND.backgroundDark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The pre-paint script sets data-theme/data-accent before React hydrates.
    <html lang="en" className={`${rubik.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <NativeBoot />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
