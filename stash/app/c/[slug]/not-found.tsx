import { Illustration } from "@/components/brand/Illustration";
import { Logo } from "@/components/brand/Logo";

export default function CollectionNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo variant="lockup" size={28} title="Stash" />
      <Illustration name="error" className="h-36" />
      <h1 className="text-title">This link doesn&apos;t work anymore</h1>
      <p className="max-w-xs text-body text-fg-muted">The person who shared it may have stopped sharing, or the address is incomplete.</p>
    </main>
  );
}
