import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "@fontsource-variable/inter";
// Headlines in the News tab.
import "@fontsource-variable/newsreader";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "RSS Reader",
  description: "Your feeds, YouTube channels, and newsletters in one calm place.",
  applicationName: "Reader",
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Reader",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#14161B" },
  ],
};

// The way out of a stuck screen. If the app hasn't come up after a while (a script that
// didn't load, a saved copy gone bad), this plain script (no bundle needed) offers to
// reload, or to drop the saved copy of the app and reload. Downloads, preferences and the
// sign-in stay. components/providers.tsx sets __readerReady once the app runs.
const STARTUP_WATCHDOG = `(function(){
  var WAIT = 12000;
  function reset(){
    var done = function(){ location.reload(); };
    try {
      var jobs = [];
      if ('caches' in window) jobs.push(caches.keys().then(function(keys){
        return Promise.all(keys.filter(function(k){ return k.indexOf('reader-') === 0; }).map(function(k){ return caches.delete(k); }));
      }));
      if ('serviceWorker' in navigator) jobs.push(navigator.serviceWorker.getRegistrations().then(function(regs){
        return Promise.all(regs.map(function(r){ return r.unregister(); }));
      }));
      try { localStorage.removeItem('swr-cache'); } catch (e) {}
      Promise.all(jobs).then(done, done);
      setTimeout(done, 4000);
    } catch (e) { done(); }
  }
  window.__readerReset = reset;
  setTimeout(function(){
    if (window.__readerReady || document.getElementById('reader-stuck')) return;
    var box = document.createElement('div');
    box.id = 'reader-stuck';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-label', 'Reader is taking too long');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:#14161B;color:#fff;font:16px/1.4 system-ui,sans-serif;text-align:center';
    var title = document.createElement('p');
    title.textContent = 'Reader is taking too long to open';
    title.style.cssText = 'font-size:19px;font-weight:600;margin:0';
    var hint = document.createElement('p');
    hint.textContent = 'Your articles, highlights and settings are safe on the server.';
    hint.style.cssText = 'margin:0;opacity:.7;max-width:22rem';
    function button(label, primary, action){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'min-width:15rem;height:48px;border-radius:999px;border:1px solid rgba(255,255,255,.25);font:600 15px system-ui,sans-serif;color:' + (primary ? '#14161B' : '#fff') + ';background:' + (primary ? '#fff' : 'transparent');
      b.onclick = action;
      return b;
    }
    box.appendChild(title);
    box.appendChild(hint);
    box.appendChild(button('Try again', true, function(){ location.reload(); }));
    box.appendChild(button('Reset the saved copy and reload', false, reset));
    box.appendChild(button('Keep waiting', false, function(){ box.remove(); }));
    document.body.appendChild(box);
  }, WAIT);
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: STARTUP_WATCHDOG }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
