"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/components/layout/ErrorBoundary";

/** A whole page failing: say so, log it, offer a reload. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => reportError(error, "page"), [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page couldn&rsquo;t be shown. It&rsquo;s been noted on the System page; reloading
        usually fixes it.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.assign("/reader")}>
          Reload the app
        </Button>
      </div>
    </main>
  );
}
