import Image from "next/image";

// Placeholder home screen; replaced by the board grid in a later task.
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
      <h1 className="sr-only">Atelier</h1>
      <Image
        className="lockup-light"
        src="/brand/atelier-lockup-light.svg"
        alt=""
        width={390}
        height={132}
        priority
        unoptimized
      />
      <Image
        className="lockup-dark"
        src="/brand/atelier-lockup-dark.svg"
        alt=""
        width={390}
        height={132}
        priority
        unoptimized
      />
      <p className="text-fg-muted">Your boards will live here.</p>
    </main>
  );
}
