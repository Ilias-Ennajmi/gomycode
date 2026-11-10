"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/components/layout/ErrorBoundary";
import { useT } from "@/lib/i18n";

/** A whole page failing: say so, log it, offer a reload. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useT();
  React.useEffect(() => reportError(error, "page"), [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <h1 className="text-xl font-semibold tracking-tight">{t("Something went wrong")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t(
          "The page couldn’t be shown. It’s been noted on the System page; reloading usually fixes it."
        )}
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>{t("Try again")}</Button>
        <Button variant="outline" onClick={() => window.location.assign("/reader")}>
          {t("Reload the app")}
        </Button>
      </div>
    </main>
  );
}
