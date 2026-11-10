import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { AppearanceControls } from "@/components/theme/AppearanceControls";
import { NearbySettings } from "@/components/places/NearbySettings";
import { ReminderSettings } from "@/components/settings/ReminderSettings";
import { DeviceIdRow } from "@/components/settings/DeviceIdRow";
import { SetupChecklist } from "@/components/settings/SetupChecklist";
import { RecoverySection } from "@/components/settings/RecoverySection";
import { BackupsList } from "@/components/settings/BackupsList";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl pt-safe pb-safe">
      <PageHeader title="Settings" back="/you" />
      <div className="flex flex-col gap-8 px-4 pb-8">
        <section id="setup" aria-labelledby="setup-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="setup-title" className="text-title">
            Setup
          </h2>
          <SetupChecklist />
        </section>
        <section id="recovery" aria-labelledby="recovery-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="recovery-title" className="text-title">
            Move to a new phone
          </h2>
          <RecoverySection />
        </section>
        <section id="backups" aria-labelledby="backups-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="backups-title" className="text-title">
            Backups
          </h2>
          <BackupsList />
        </section>
        <section id="appearance" aria-labelledby="appearance-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="appearance-title" className="text-title">
            Appearance
          </h2>
          <div className="rounded-xl bg-surface p-4 shadow-pop">
            <AppearanceControls />
          </div>
        </section>
        <section id="reminders" aria-labelledby="reminders-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="reminders-title" className="text-title">
            Reminders
          </h2>
          <div className="rounded-xl bg-surface p-4 shadow-pop">
            <ReminderSettings />
          </div>
        </section>
        <section id="nearby" aria-label="Nearby" className="scroll-mt-4">
          <NearbySettings />
        </section>
        <section id="device" aria-labelledby="device-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="device-title" className="text-title">
            This device
          </h2>
          <DeviceIdRow />
        </section>
      </div>
    </main>
  );
}
