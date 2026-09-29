"use client";

import type { DiscoverKind } from "@/lib/discover/catalog";
import * as React from "react";
import {
  ChevronRight,
  Compass,
  Download,
  FolderCog,
  Keyboard,
  Library,
  LogOut,
  Monitor,
  Moon,
  Plus,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAiStatus } from "@/lib/hooks/useAi";
import { androidAppVersion, RELEASES_PAGE } from "@/lib/native";
import { NotificationSettings } from "@/components/layout/NotificationSettings";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { needingAttention } from "@/lib/feed-health";

interface SettingsPanelProps {
  onAddFeed: (kind?: DiscoverKind) => void;
  onManageSources: (attention?: boolean) => void;
  onManageCategories: () => void;
  onContentFilters: () => void;
  onImportOpml: () => void;
  onShowShortcuts: () => void;
}

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

/** Mobile settings screen; on desktop the same actions live in the sidebar footer. */
export function SettingsPanel({
  onAddFeed,
  onManageSources,
  onManageCategories,
  onContentFilters,
  onImportOpml,
  onShowShortcuts,
}: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const { feeds } = useFeeds();
  const attention = needingAttention(feeds).length;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 py-3">
        <h2 className="tracking-tight text-2xl font-semibold">Settings</h2>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <Section title="Sources">
          <Row
            icon={Compass}
            label="Discover sources"
            hint="Browse by interest, search, or paste a link"
            onClick={() => onAddFeed()}
          />
          <Row
            icon={Library}
            label="Your sources"
            hint={
              attention > 0
                ? `${attention} ${attention === 1 ? "needs" : "need"} attention: not loading or no new posts`
                : "Rename, move, mute or unfollow"
            }
            warn={attention > 0}
            onClick={() => onManageSources(attention > 0)}
          />
          <Row icon={FolderCog} label="Categories" onClick={onManageCategories} />
          <Row
            icon={SlidersHorizontal}
            label="Content filters"
            hint="Hide or boost topics and sources"
            onClick={onContentFilters}
          />
        </Section>

        <Section title="AI">
          <AiStatusRow />
        </Section>

        <Section title="Appearance">
          <div className="grid grid-cols-3 gap-2 p-2">
            {THEMES.map(({ id, label, icon: Icon }) => {
              const active = mounted && theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border py-3 text-xs font-medium",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Your data">
          <Row icon={Upload} label="Import OPML" onClick={onImportOpml} />
          <Row
            icon={Download}
            label="Export OPML"
            onClick={() => window.open("/api/opml", "_blank")}
          />
        </Section>

        <Section title="Notifications">
          <NotificationSettings />
        </Section>

        <Section title="App">
          <AppRow />
        </Section>

        <Section title="Help">
          <Row icon={Keyboard} label="Keyboard shortcuts" onClick={onShowShortcuts} />
        </Section>

        <Section>
          <Row icon={LogOut} label="Sign out" destructive onClick={signOut} />
        </Section>
      </div>
    </div>
  );
}

function AppRow() {
  const [version, setVersion] = React.useState<string | null>(null);
  React.useEffect(() => setVersion(androidAppVersion()), []);
  return (
    <Row
      icon={Smartphone}
      label={version ? `Reader for Android ${version}` : "Get the Android app"}
      hint={
        version
          ? "Updates arrive through the website; new app versions are on GitHub"
          : "Install Reader as an app, with sharing and shortcuts"
      }
      onClick={() => window.open(RELEASES_PAGE, "_blank")}
    />
  );
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      {title && (
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  warn,
  destructive,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  hint?: string;
  warn?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-accent/60",
        destructive && "text-destructive"
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", !destructive && "text-muted-foreground")} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && (
          <span
            className={cn(
              "block truncate text-xs",
              warn ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"
            )}
          >
            {hint}
          </span>
        )}
      </span>
      {!destructive && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

function AiStatusRow() {
  const status = useAiStatus();
  if (!status) return <div className="h-[68px]" />;

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <Sparkles
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          status.enabled ? "text-primary" : "text-muted-foreground"
        )}
      />
      <div className="min-w-0 flex-1 text-sm">
        {status.enabled ? (
          <>
            <p className="font-medium">On · Google Gemini (free tier)</p>
            <p className="text-xs text-muted-foreground">
              Learned from {status.learnedFrom} article{status.learnedFrom === 1 ? "" : "s"} you
              read or saved · {status.analyzed} analyzed · {status.topics}{" "}
              {status.topics === 1 ? "story" : "stories"} grouped
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">Off</p>
            <p className="text-xs text-muted-foreground">
              Add a free GEMINI_API_KEY in Vercel to turn on summaries, story grouping, and the
              daily briefing. For You still learns from the sources you read.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
