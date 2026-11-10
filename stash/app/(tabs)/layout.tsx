import { BottomBar } from "@/components/shell/BottomBar";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { NearbyCheck } from "@/components/places/NearbyCheck";
import { ContextCheck } from "@/components/reminders/ContextCheck";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineBanner />
      <NearbyCheck />
      <ContextCheck rule="evening_open" />
      {/* Bottom padding keeps content clear of the bar and the raised Play button. */}
      <main className="mx-auto min-h-dvh max-w-xl pb-[calc(var(--bar-height)+var(--play-raise)+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomBar />
    </>
  );
}
