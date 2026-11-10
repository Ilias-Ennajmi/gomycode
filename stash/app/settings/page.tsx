import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { AppearanceControls } from "@/components/theme/AppearanceControls";
import { NearbySettings } from "@/components/places/NearbySettings";
import { ReminderSettings } from "@/components/settings/ReminderSettings";
import { DeviceIdRow } from "@/components/settings/DeviceIdRow";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl pt-safe pb-safe">
      <PageHeader title="Settings" back="/you" />
      <div className="flex flex-col gap-10 px-4 pb-8">
        <section id="appearance" aria-labelledby="appearance-title" className="flex scroll-mt-4 flex-col gap-4">
          <h2 id="appearance-title" className="text-title">
            Appearance
          </h2>
          <AppearanceControls />
        </section>
        <section id="reminders" aria-labelledby="reminders-title" className="flex scroll-mt-4 flex-col gap-4">
          <h2 id="reminders-title" className="text-title">
            Reminders
          </h2>
          <ReminderSettings />
        </section>
        <section id="nearby" aria-label="Nearby" className="scroll-mt-4">
          <NearbySettings />
        </section>
        <section id="device" aria-labelledby="device-title" className="flex scroll-mt-4 flex-col gap-4">
          <h2 id="device-title" className="text-title">
            This device
          </h2>
          <DeviceIdRow />
        </section>
      </div>
    </main>
  );
}
