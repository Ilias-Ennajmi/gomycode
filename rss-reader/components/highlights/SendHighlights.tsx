"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/utils";

// Highlights → Send to…: connect Readwise or a Notion database with your own token, send
// now, and new highlights follow after each hourly refresh (lib/exports.ts).

type Status = Record<"readwise" | "notion", { connected: boolean; lastAt: string | null }>;

const HELP = {
  readwise: "Your token is at readwise.io/access_token.",
  notion:
    "Make an integration at notion.so/my-integrations, copy its secret, and share the database with it (⋯ → Connections). Each article becomes a page, its highlights quotes.",
} as const;

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/highlights/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export function SendHighlightsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, mutate } = useSWR<Status>(open ? "/api/highlights/send" : null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Send highlights">
      <div className="space-y-4 px-4 pb-4">
        {(["readwise", "notion"] as const).map((service) => (
          <Service
            key={service}
            service={service}
            status={data?.[service]}
            onChange={(next) => mutate(next, { revalidate: false })}
          />
        ))}
      </div>
    </Sheet>
  );
}

function Service({
  service,
  status,
  onChange,
}: {
  service: "readwise" | "notion";
  status?: { connected: boolean; lastAt: string | null };
  onChange: (status: Status) => void;
}) {
  const name = service === "readwise" ? "Readwise" : "Notion";
  const [token, setToken] = React.useState("");
  const [database, setDatabase] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(label: string, body: Record<string, unknown>, done?: (d: never) => string) {
    setBusy(label);
    try {
      const result = await post({ service, ...body });
      onChange(result);
      if (done) toast.success(done(result as never));
      setToken("");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label={name} className="rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{name}</h3>
        {status?.connected && (
          <span className="text-xs text-muted-foreground">
            {status.lastAt ? `Sent ${formatRelativeTime(status.lastAt)}` : "Connected"}
          </span>
        )}
      </div>
      {status?.connected ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            New highlights go there by themselves every hour.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                run("send", { action: "send" }, (d: { sent: number }) =>
                  d.sent ? `${d.sent} sent to ${name}` : "Nothing new to send"
                )
              }
            >
              {busy === "send" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Send new now
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                // Readwise recognises what it already has. Notion can't: sending everything
                // again makes new pages next to the old ones.
                if (
                  service === "notion" &&
                  !window.confirm(
                    "Send everything to Notion again? This makes new pages; the ones already there stay. Use it after emptying the database."
                  )
                ) {
                  return;
                }
                void run(
                  "all",
                  { action: "send", all: true },
                  (d: { sent: number }) => `${d.sent} sent to ${name}`
                );
              }}
            >
              {busy === "all" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {service === "notion" ? "Start over" : "Send all again"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={async () => {
                const res = await fetch(`/api/highlights/send?service=${service}`, {
                  method: "DELETE",
                });
                if (res.ok) onChange(await res.json());
              }}
            >
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <form
          className="mt-2 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run("connect", { action: "connect", token, database }, () => `${name} connected`);
          }}
        >
          <p className="text-xs text-muted-foreground">{HELP[service]}</p>
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              service === "readwise" ? "Readwise access token" : "Notion integration secret"
            }
            aria-label={`${name} token`}
          />
          {service === "notion" && (
            <Input
              value={database}
              onChange={(event) => setDatabase(event.target.value)}
              placeholder="Database link or ID"
              aria-label="Notion database"
            />
          )}
          <Button
            type="submit"
            size="sm"
            disabled={!token.trim() || (service === "notion" && !database.trim()) || busy !== null}
          >
            {busy === "connect" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Connect
          </Button>
        </form>
      )}
    </section>
  );
}
