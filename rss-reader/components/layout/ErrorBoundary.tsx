"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Tells the server about a crash so it shows on the System page. Never throws. */
export function reportError(error: unknown, where: string) {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const detail = error instanceof Error ? error.stack : undefined;
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, detail, where }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Nothing more to do.
  }
}

interface Props {
  /** Which part of the app this guards: shown in the log. */
  name: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * One part of the screen failing (the list, the reader, a page) shows a small "something
 * went wrong" with a retry, instead of taking the whole app down.
 */
export class ErrorBoundary extends React.Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportError(error, this.props.name);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        className={
          this.props.className ??
          "flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground"
        }
        role="alert"
      >
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm">
          This part of the app hit a snag. It&rsquo;s been noted; try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => this.setState({ error: null })}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    );
  }
}
