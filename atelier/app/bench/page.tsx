import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BenchClient } from "./bench-client";

export const metadata: Metadata = { title: "Bench" };

/**
 * The 1,000-image performance gate (SPEC section 8) runs against this page. It exists only when the server was
 * started with ATELIER_BENCH=1 and is never served on Vercel production; everywhere else it is a 404.
 */
export default async function BenchPage() {
  await connection();
  if (process.env.ATELIER_BENCH !== "1" || process.env.VERCEL_ENV === "production") notFound();
  return <BenchClient />;
}
