import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { AppearanceControls } from "@/components/theme/AppearanceControls";
import { NearbySettings } from "@/components/places/NearbySettings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl pt-safe pb-safe">
      <PageHeader title="Settings" eyebrow="Appearance and Nearby" back="/you" />
      <div className="px-4 pb-8">
        <AppearanceControls />
      </div>
      <div className="px-4 pb-8">
        <NearbySettings />
      </div>
    </main>
  );
}
