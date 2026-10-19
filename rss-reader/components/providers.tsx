"use client";

import { SWRConfig } from "swr";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Not signed in");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  return res.json();
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      themes={["light", "dark", "paper", "system"]}
      disableTransitionOnChange
    >
      <SWRConfig
        value={{
          fetcher,
          refreshInterval: 5 * 60 * 1000,
          revalidateOnFocus: true,
          // Coming back to the app refreshes what's open, but not more than every half minute.
          focusThrottleInterval: 30_000,
          shouldRetryOnError: true,
        }}
      >
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="bottom-right" richColors />
        </TooltipProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
