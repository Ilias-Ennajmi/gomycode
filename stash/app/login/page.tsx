import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCard } from "./LoginCard";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 pt-safe pb-safe">
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
