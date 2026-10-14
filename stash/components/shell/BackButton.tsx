"use client";

import { useRouter } from "next/navigation";

type NavigationLike = { currentEntry?: { index: number }; entries?: () => { url: string | null }[] };

/** True when the previous history entry is a page of this app (Navigation API, Chrome). */
function canGoBackInApp(): boolean {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  const index = nav?.currentEntry?.index ?? 0;
  const prev = index > 0 ? nav?.entries?.()[index - 1] : undefined;
  return Boolean(prev?.url && new URL(prev.url).origin === window.location.origin);
}

/**
 * Goes one level up: back through history when we came from inside the app (so
 * Android back doesn't return to the screen just left), otherwise replaces the
 * current page with `fallback`.
 */
export function BackButton({
  fallback,
  label,
  className,
  children,
}: {
  fallback: string;
  label: string;
  className?: string;
  /** The icon element (passed as a child so Server Components can render this). */
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => (canGoBackInApp() ? router.back() : router.replace(fallback))}
      className={className}
    >
      {children}
    </button>
  );
}
