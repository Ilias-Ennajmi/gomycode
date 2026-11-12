import Link from "next/link";
import { buttonSecondary } from "@/components/ui/controls";

/** A full-page message in the editor's place: a board that does not exist, or one that could not be opened. */
export function BoardMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <h1 className="text-(length:--text-xl) font-semibold">{title}</h1>
      <p className="max-w-md text-fg-muted">{children}</p>
      <Link href="/" className={`${buttonSecondary} mt-3`}>
        Back to your boards
      </Link>
    </div>
  );
}

export function BoardOpening() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh items-center justify-center bg-canvas text-fg-muted">
      Opening board…
    </div>
  );
}
