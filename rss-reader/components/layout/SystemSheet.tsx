"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Cpu, Loader2, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import { outboxSize } from "@/lib/outbox";
import { cacheLaterForOffline } from "@/components/layout/OfflineSupport";
import type { LoggedError } from "@/lib/errlog";

interface SystemInfo {
  build: {
    commit: string | null;
    branch: string | null;
    region: string | null;
    env: string;
    node: string;
  };
  database: {
    bytes: number | null;
    articles: number;
    feeds: number;
    highlights: number;
    pushSubscriptions: number;
  };
  services: { ai: boolean; push: boolean };
  lastTick: Record<string, unknown>;
  lastVideoTick: { at?: number };
  errors: LoggedError[];
}

function megabytes(bytes: number | null) {
  if (bytes === null) return "–";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What's offline on this device: how many articles the service worker holds. */
function useOfflineState(open: boolean) {
  const [state, setState] = React.useState<{ articles: number; worker: boolean } | null>(null);
  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const worker = Boolean(navigator.serviceWorker?.controller);
        const names = await caches.keys();
        const data = names.find((n) => n.startsWith("reader-data-"));
        let articles = 0;
        if (data) {
          const keys = await (await caches.open(data)).keys();
          articles = keys.filter((k) =>
            /\/api\/articles\/[^/?]+$/.test(new URL(k.url).pathname)
          ).length;
        }
        setState({ articles, worker });
      } catch {
        setState({ articles: 0, worker: false });
      }
    })();
  }, [open]);
  return state;
}

/** Settings → Under the hood: the build, the database, the last refresh, offline, errors. */
export function SystemSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, mutate, isLoading } = useSWR<SystemInfo>(open ? "/api/system" : null, {
    revalidateOnFocus: false,
  });
  const offline = useOfflineState(open);
  const [clearing, setClearing] = React.useState(false);
  const tickAt = typeof data?.lastTick.at === "number" ? (data.lastTick.at as number) : null;

  async function clearErrors() {
    setClearing(true);
    try {
      await fetch("/api/errors", { method: "DELETE" });
      await mutate();
    } finally {
      setClearing(false);
    }
  }

  async function clearOffline() {
    try {
      for (const name of await caches.keys()) {
        if (name.startsWith("reader-data-") || name.startsWith("reader-images-"))
          await caches.delete(name);
      }
      toast.success("Offline copies cleared");
    } catch {
      toast.error("Could not clear them");
    }
  }

  const rows: [string, React.ReactNode][] = data
    ? [
        [
          "Build",
          `${data.build.commit ?? "dev"}${data.build.branch ? ` · ${data.build.branch}` : ""} · ${data.build.env}`,
        ],
        ["Server", `${data.build.region ?? "local"} · Node ${data.build.node}`],
        [
          "Database",
          `${megabytes(data.database.bytes)} · ${data.database.articles} articles · ${data.database.feeds} sources · ${data.database.highlights} highlights`,
        ],
        [
          "Services",
          `AI ${data.services.ai ? "on" : "off"} · push ${data.services.push ? "on" : "off"} (${data.database.pushSubscriptions} device${data.database.pushSubscriptions === 1 ? "" : "s"})`,
        ],
        [
          "Last hourly refresh",
          tickAt
            ? `${formatRelativeTime(new Date(tickAt))} · ${String(data.lastTick.newArticles ?? 0)} new · ${String(data.lastTick.updated ?? 0)} read · ${String(data.lastTick.skipped ?? 0)} skipped · ${String(data.lastTick.failed ?? 0)} failed · ${Math.round(Number(data.lastTick.ms ?? 0) / 1000)} s`
            : "not yet",
        ],
        [
          "Last video/audio run",
          data.lastVideoTick.at ? formatRelativeTime(new Date(data.lastVideoTick.at)) : "not yet",
        ],
        [
          "Offline on this device",
          offline
            ? `${offline.worker ? "service worker on" : "no service worker"} · ${offline.articles} article${offline.articles === 1 ? "" : "s"} saved · ${outboxSize()} change${outboxSize() === 1 ? "" : "s"} waiting`
            : "…",
        ],
      ]
    : [];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" /> Under the hood
        </span>
      }
    >
      <div className="px-3" data-scroll>
        {isLoading || !data ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking…
          </p>
        ) : (
          <>
            <dl className="divide-y text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="flex gap-3 py-2">
                  <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 flex-1 break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cacheLaterForOffline();
                  toast("Saving Later for offline…");
                }}
              >
                Save Later offline now
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void clearOffline()}>
                Clear offline copies
              </Button>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Errors ({data.errors.length})
              </h3>
              {data.errors.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => void clearErrors()}
                  disabled={clearing}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
            {data.errors.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing logged. Good.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.errors.slice(0, 20).map((e, i) => (
                  <li key={i} className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                    <p className="flex justify-between gap-2 text-muted-foreground">
                      <span className="font-medium text-foreground">{e.scope}</span>
                      <span>{formatRelativeTime(new Date(e.at))}</span>
                    </p>
                    <p className="mt-0.5 break-words">{e.message}</p>
                    {e.detail && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-muted-foreground">Details</summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10.5px] text-muted-foreground">
                          {e.detail}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
