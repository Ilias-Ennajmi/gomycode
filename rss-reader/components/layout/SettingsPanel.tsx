"use client";

import type { DiscoverKind } from "@/lib/discover/catalog";
import * as React from "react";
import {
  Archive,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  PinOff,
  Compass,
  Cpu,
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
import { useAiStatus, type AiStatus } from "@/lib/hooks/useAi";
import { WhatsNew } from "@/components/layout/WhatsNew";
import { SystemSheet } from "@/components/layout/SystemSheet";
import { useT, type Locale } from "@/lib/i18n";
import { ACCENTS, useAccent } from "@/lib/hooks/useAccent";
import { GOALS, useReadingGoal } from "@/lib/hooks/useReadingGoal";
import { TAB_TYPES, usePersonal, type Personal } from "@/lib/hooks/usePersonal";
import { useComfort } from "@/lib/hooks/useComfort";
import { StarterPacks } from "@/components/onboarding/StarterPacks";
import { useCategories } from "@/lib/hooks/useFeeds";
import { usePref } from "@/lib/prefs";
import { androidAppVersion, RELEASES_PAGE } from "@/lib/native";
import { NotificationSettings } from "@/components/layout/NotificationSettings";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { needingAttention } from "@/lib/feed-health";
import { START_VIEWS, START_VIEW_KEY, useReaderState } from "@/lib/hooks/useReaderState";

const START_LABELS: Record<(typeof START_VIEWS)[number], string> = {
  foryou: "For You",
  briefing: "Today",
  news: "News",
  later: "Later",
};

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
  { id: "paper", label: "Paper", icon: BookOpen },
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
  const [whatsNew, setWhatsNew] = React.useState(false);
  const [system, setSystem] = React.useState(false);
  const { t, locale, setLocale } = useT();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const { feeds } = useFeeds();
  const attention = needingAttention(feeds).length;
  const { setView, setMobilePane } = useReaderState();
  const [startRaw, setStartView] = usePref<string>(START_VIEW_KEY, "foryou");
  const startView = (START_VIEWS as readonly string[]).includes(startRaw)
    ? (startRaw as (typeof START_VIEWS)[number])
    : "foryou";
  const { accent, setAccent } = useAccent();
  const { goal, setGoal, minutes } = useReadingGoal();
  const { personal, update } = usePersonal();
  const { categories } = useCategories();
  const { comfort, update: updateComfort } = useComfort();
  const [packsOpen, setPacksOpen] = React.useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="tracking-tight text-2xl font-semibold">{t("Settings")}</h1>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <Section title={t("Personalise")}>
          <Row
            icon={BarChart3}
            label={t("Your reading")}
            hint={t("Articles, time and highlights over the last 30 days")}
            onClick={() => {
              setView({ type: "stats", label: "Your reading" });
              setMobilePane("list");
            }}
          />
          <div className="px-4 py-3">
            <p className="text-sm font-medium">{t("Language")}</p>
            <div
              role="radiogroup"
              aria-label="Language"
              className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
            >
              {(["en", "fr"] as Locale[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={locale === id}
                  onClick={() => setLocale(id)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm transition-colors",
                    locale === id
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {id === "en" ? "English" : "Français"}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm font-medium">{t("Start on")}</p>
            <div
              role="radiogroup"
              aria-label="Start on"
              className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1"
            >
              {START_VIEWS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={startView === id}
                  onClick={() => setStartView(id)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm transition-colors",
                    startView === id
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(START_LABELS[id])}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="flex items-baseline justify-between text-sm font-medium">
              {t("Daily goal")}
              <span className="text-xs font-normal text-muted-foreground">{minutes} min today</span>
            </p>
            <div
              role="radiogroup"
              aria-label="Daily goal"
              className="mt-2 grid grid-cols-5 gap-1 rounded-lg bg-muted p-1"
            >
              {GOALS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={goal === value}
                  onClick={() => setGoal(value)}
                  className={cn(
                    "rounded-md px-1 py-1.5 text-sm tabular-nums transition-colors",
                    goal === value
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {value}
                  <span className="text-[10px]">m</span>
                </button>
              ))}
            </div>
          </div>
          <Switch
            label={t("Stories row")}
            hint={t("Sources with something new, above the lists")}
            on={personal.stories}
            onChange={(on) => update({ stories: on })}
          />
          <Switch
            label={t("Goal ring")}
            hint={t("Today's minutes against your goal, on For You and Today")}
            on={personal.ring}
            onChange={(on) => update({ ring: on })}
          />
          <Switch
            label={t("Briefing card")}
            hint={t("Today's briefing at the top of For You")}
            on={personal.briefingCard}
            onChange={(on) => update({ briefingCard: on })}
          />
          <Switch
            label={t("Compact density")}
            hint={t("Tighter cards, more on screen")}
            on={personal.density === "compact"}
            onChange={(on) => update({ density: on ? "compact" : "comfortable" })}
          />
          <Switch
            label={t("Haptics")}
            hint={t("A tap you can feel on saves, swipes and goals")}
            on={personal.haptics}
            onChange={(on) => update({ haptics: on })}
          />
          <TabEditor personal={personal} update={update} categories={categories} />
        </Section>

        <Section title={t("Reading comfort")}>
          <Switch
            label={t("Bionic reading")}
            hint={t("The start of each word in bold, to carry the eye")}
            on={comfort.bionic}
            onChange={(on) => updateComfort({ bionic: on })}
          />
          <Switch
            label={t("Larger tap targets")}
            hint={t("Bigger buttons and rows")}
            on={comfort.bigTargets}
            onChange={(on) => updateComfort({ bigTargets: on })}
          />
          <Switch
            label={t("Dark after sunset")}
            hint={t("Light by day, dark by night, by the clock (and your location when shared)")}
            on={comfort.autoDark}
            onChange={(on) => updateComfort({ autoDark: on })}
          />
          <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground">
            {t(
              "Pages instead of a scroll, and the easy-to-read font, are in the reader: ⋯ and Aa."
            )}
          </p>
        </Section>

        <Section title={t("Sources")}>
          <Row
            icon={Compass}
            label={t("Discover sources")}
            hint={t("Browse by interest, search, or paste a link")}
            onClick={() => onAddFeed()}
          />
          <Row
            icon={Library}
            label={t("Your sources")}
            hint={
              attention > 0
                ? `${attention} ${attention === 1 ? "needs" : "need"} attention: not loading or no new posts`
                : t("Rename, move, mute or unfollow")
            }
            warn={attention > 0}
            onClick={() => onManageSources(attention > 0)}
          />
          <Row
            icon={Sparkles}
            label={t("Starter packs")}
            hint={t("Follow a curated bundle for an interest in one tap")}
            onClick={() => setPacksOpen(true)}
          />
          <Row icon={FolderCog} label={t("Categories")} onClick={onManageCategories} />
          <Row
            icon={SlidersHorizontal}
            label={t("Content filters")}
            hint={t("Hide, boost, alerts and auto-save")}
            onClick={onContentFilters}
          />
        </Section>

        <Section title={t("AI")}>
          <AiStatusRow />
        </Section>

        <Section title={t("Appearance")}>
          <div className="grid grid-cols-4 gap-2 p-2">
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
                  {t(label)}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-3">
            <p className="text-sm font-medium">{t("Accent colour")}</p>
            <div
              role="radiogroup"
              aria-label="Accent colour"
              className="mt-2 flex flex-wrap gap-2.5"
            >
              {ACCENTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={accent === option.id}
                  aria-label={option.label}
                  title={option.label}
                  onClick={() => setAccent(option.id)}
                  className={cn(
                    "h-8 w-8 rounded-full ring-offset-2 ring-offset-card transition-transform",
                    accent === option.id ? "scale-110 ring-2 ring-foreground" : "hover:scale-105"
                  )}
                  style={{ backgroundColor: option.swatch }}
                />
              ))}
            </div>
          </div>
        </Section>

        <Section title={t("Your data")}>
          <Row icon={Upload} label={t("Import OPML")} onClick={onImportOpml} />
          <Row
            icon={Download}
            label={t("Export OPML")}
            onClick={() => window.open("/api/opml", "_blank")}
          />
          <Row
            icon={Archive}
            label={t("Download a backup")}
            hint={t("Sources, highlights, saved articles and settings, as one file")}
            onClick={() => window.open("/api/backup", "_blank")}
          />
        </Section>

        <Section title={t("Notifications")}>
          <NotificationSettings />
        </Section>

        <Section title={t("App")}>
          <AppRow />
          <Row
            icon={Cpu}
            label={t("Under the hood")}
            hint={t("Build, database, last refresh, errors")}
            onClick={() => setSystem(true)}
          />
          <SystemSheet open={system} onOpenChange={setSystem} />
        </Section>

        <Section title={t("Help")}>
          <Row icon={Keyboard} label={t("Keyboard shortcuts")} onClick={onShowShortcuts} />
          <Row icon={Sparkles} label={t("What's new")} onClick={() => setWhatsNew(true)} />
          {packsOpen && <StarterPacks open onOpenChange={setPacksOpen} />}
          <WhatsNew open={whatsNew} onOpenChange={setWhatsNew} />
        </Section>

        <Section>
          <Row icon={LogOut} label={t("Sign out")} destructive onClick={signOut} />
        </Section>
      </div>
    </div>
  );
}

/** A row with a switch on the right. */
function Switch({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          on ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
            on ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}

const TAB_LABELS: Record<string, string> = {
  foryou: "For You",
  news: "News",
  rss: "RSS",
  youtube: "YouTube",
  newsletters: "Newsletters",
  podcasts: "Podcasts",
  later: "Later",
};

/** The top tabs: reorder, hide, and pin categories as tabs of their own. */
function TabEditor({
  personal,
  update,
  categories,
}: {
  personal: Personal;
  update: (changes: Partial<Personal>) => void;
  categories: { id: string; name: string; color: string }[];
}) {
  const { t } = useT();
  const move = (type: Personal["tabs"][number], direction: -1 | 1) => {
    const tabs = [...personal.tabs];
    const i = tabs.indexOf(type);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= tabs.length) return;
    [tabs[i], tabs[j]] = [tabs[j], tabs[i]];
    update({ tabs });
  };
  const toggleHidden = (type: Personal["tabs"][number]) =>
    update({
      hiddenTabs: personal.hiddenTabs.includes(type)
        ? personal.hiddenTabs.filter((x) => x !== type)
        : personal.hiddenTabs.length < TAB_TYPES.length - 1
          ? [...personal.hiddenTabs, type]
          : personal.hiddenTabs,
    });
  const unpinned = categories.filter((c) => !personal.pinnedCategories.includes(c.id));
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium">{t("Tabs")}</p>
      <p className="text-xs text-muted-foreground">
        {t(
          "Order them, hide the ones you don't use, pin a category. On phones the first four (five if that's all) sit in the bottom bar; the rest are under More."
        )}
      </p>
      <ol className="mt-2 divide-y rounded-lg border">
        {personal.tabs.map((type, i) => {
          const hidden = personal.hiddenTabs.includes(type);
          return (
            <li key={type} className="flex items-center gap-1 py-1 pl-3 pr-1">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  hidden && "text-muted-foreground line-through"
                )}
              >
                {t(TAB_LABELS[type] ?? type)}
              </span>
              <button
                type="button"
                onClick={() => move(type, -1)}
                disabled={i === 0}
                aria-label={`Move ${TAB_LABELS[type]} up`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(type, 1)}
                disabled={i === personal.tabs.length - 1}
                aria-label={`Move ${TAB_LABELS[type]} down`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={!hidden}
                aria-label={`${hidden ? "Show" : "Hide"} ${TAB_LABELS[type]}`}
                onClick={() => toggleHidden(type)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent",
                  hidden ? "text-muted-foreground" : "text-primary"
                )}
              >
                {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </li>
          );
        })}
        {personal.pinnedCategories.map((id) => {
          const category = categories.find((c) => c.id === id);
          if (!category) return null;
          return (
            <li key={id} className="flex items-center gap-2 py-1 pl-3 pr-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: category.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
              <button
                type="button"
                onClick={() =>
                  update({ pinnedCategories: personal.pinnedCategories.filter((x) => x !== id) })
                }
                aria-label={`Unpin ${category.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
              >
                <PinOff className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ol>
      {unpinned.length > 0 && (
        <select
          aria-label="Pin a category as a tab"
          value=""
          onChange={(event) => {
            if (event.target.value)
              update({ pinnedCategories: [...personal.pinnedCategories, event.target.value] });
          }}
          className="mt-2 h-9 w-full rounded-lg border bg-background px-2 text-sm"
        >
          <option value="">{t("Pin a category as a tab…")}</option>
          {unpinned.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
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
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
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

const USAGE_LABELS = { embed: "Analysis", text: "Summaries", video: "Video & audio" } as const;

/** Today's share of the free daily quota, so "summaries later" has a visible reason. */
function AiUsage({ usage, paused }: { usage: NonNullable<AiStatus["usage"]>; paused: string[] }) {
  return (
    <div className="mt-2.5 space-y-1.5">
      {usage.map(({ bucket, used, limit }) => {
        const percent = Math.min(100, Math.round((used / limit) * 100));
        return (
          <div key={bucket} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-24 shrink-0">{USAGE_LABELS[bucket]}</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  percent >= 90 ? "bg-amber-500" : "bg-primary/70"
                )}
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums">
              {used}/{limit}
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        Today&apos;s free quota (resets around 8–9 am Morocco time).{" "}
        {paused.length > 0
          ? "Google asked for a pause; things you open still get priority once it lifts."
          : "Background work stops at 75%, keeping the rest for what you open."}
      </p>
    </div>
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
            {status.usage && <AiUsage usage={status.usage} paused={status.paused ?? []} />}
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
