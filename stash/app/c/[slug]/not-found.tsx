import { Link2Off } from "lucide-react";

export default function CollectionNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-raised text-fg-muted">
        <Link2Off size={24} strokeWidth={2} aria-hidden />
      </span>
      <h1 className="text-title">This link doesn&apos;t work anymore</h1>
      <p className="max-w-xs text-body text-fg-muted">The person who shared it may have stopped sharing, or the address is incomplete.</p>
    </main>
  );
}
