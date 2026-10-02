"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  Bell,
  Bookmark,
  Captions,
  Check,
  ChevronDown,
  Clock,
  Galaxy,
  Grid2x2,
  Inbox,
  Map as MapIcon,
  Mic,
  Play,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AccentPicker } from "@/components/theme/AccentPicker";
import { PreviewCard } from "@/components/theme/PreviewCard";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { useAppearance } from "@/components/theme/ThemeProvider";
import { AiLabel } from "@/components/ui/AiLabel";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { ProgressSegments } from "@/components/ui/ProgressSegments";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Slider } from "@/components/ui/Slider";
import { SpaceChip } from "@/components/ui/SpaceChip";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { Thumbnail } from "@/components/ui/Thumbnail";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, SPACE_COLORS, SPACE_LABEL, SPACE_TINT, spaceVar, type SpaceColor } from "@/components/ui/space";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { useLiveTokens, useSystemTheme } from "./useLiveTokens";

/* ---------------------------------------------------------------- data */

const SECTIONS = [
  ["colours", "Colours"],
  ["spaces", "Space palette"],
  ["accents", "Accent presets"],
  ["type", "Typography"],
  ["spacing", "Spacing"],
  ["radii", "Radii"],
  ["motion", "Motion"],
  ["icons", "Icons"],
  ["components", "Components"],
  ["themes", "All themes"],
] as const;

const COLOUR_TOKENS = [
  { name: "background", cssVar: "--background", utility: "bg-background" },
  { name: "surface", cssVar: "--surface", utility: "bg-surface" },
  { name: "surfaceRaised", cssVar: "--surface-raised", utility: "bg-raised" },
  { name: "border", cssVar: "--border", utility: "border-line" },
  { name: "textPrimary", cssVar: "--text-primary", utility: "text-fg" },
  { name: "textSecondary", cssVar: "--text-secondary", utility: "text-fg-muted" },
  { name: "textTertiary", cssVar: "--text-tertiary", utility: "text-fg-subtle" },
  { name: "accent", cssVar: "--accent", utility: "bg-accent" },
  { name: "onAccent", cssVar: "--on-accent", utility: "text-on-accent" },
  { name: "insight", cssVar: "--insight", utility: "text-insight" },
  { name: "danger", cssVar: "--danger", utility: "text-danger" },
  { name: "scrim base (used at 80%)", cssVar: "--scrim-base", utility: "bg-scrim" },
] as const;

const ACCENT_TOKENS = [
  { name: "Lime (default)", cssVar: "--accent-lime" },
  { name: "Coral", cssVar: "--accent-coral" },
  { name: "Sky", cssVar: "--accent-sky" },
  { name: "Gold", cssVar: "--accent-gold" },
  { name: "Mono (text colour)", cssVar: "--text-primary" },
] as const;

const TYPE_STYLES = [
  { name: "Display", cls: "font-display text-display", spec: "30 / 700 · Bricolage Grotesque", sample: "Your 5 for today" },
  { name: "Title", cls: "font-display text-title", spec: "22 / 700 · Bricolage Grotesque", sample: "Library" },
  { name: "Heading", cls: "font-display text-heading", spec: "18 / 700 · Bricolage Grotesque", sample: "What these saves say" },
  { name: "Body", cls: "text-body", spec: "15 / 500 · Manrope", sample: "Hook viewers in the first second with a question." },
  { name: "Label", cls: "text-label", spec: "14 / 600 · Manrope", sample: "Start · 6 min" },
  { name: "Caption", cls: "text-caption", spec: "13 / 500 · Manrope", sample: "3 of 5 this week" },
  { name: "Tab", cls: "text-tab", spec: "12 / 600 · tab labels only", sample: "Today  Library  Learn  You" },
  { name: "Input", cls: "text-input", spec: "16 · inputs never zoom", sample: "Search what was said…" },
] as const;

const SPACING = [
  { step: 1, px: 4, cls: "w-1" },
  { step: 2, px: 8, cls: "w-2" },
  { step: 3, px: 12, cls: "w-3" },
  { step: 4, px: 16, cls: "w-4" },
  { step: 5, px: 20, cls: "w-5" },
  { step: 6, px: 24, cls: "w-6" },
  { step: 8, px: 32, cls: "w-8" },
] as const;

const RADII = [
  { name: "sm", px: 10, cls: "rounded-sm", use: "small" },
  { name: "card", px: 14, cls: "rounded-card", use: "buttons, cards" },
  { name: "lg", px: 20, cls: "rounded-lg", use: "large cards" },
  { name: "xl", px: 24, cls: "rounded-xl", use: "hero" },
  { name: "sheet", px: 28, cls: "rounded-t-sheet", use: "bottom sheets (top corners)" },
  { name: "full", px: 9999, cls: "rounded-full", use: "chips, Play, avatars" },
] as const;

const DURATIONS = [
  { name: "fast", cssVar: "--dur-fast", ms: 150, use: "small changes" },
  { name: "screen", cssVar: "--dur-screen", ms: 250, use: "screen transitions" },
  { name: "sheet", cssVar: "--dur-sheet", ms: 350, use: "sheets (spring)" },
] as const;

const ICONS = [
  ["Play", Play],
  ["Search", Search],
  ["Inbox", Inbox],
  ["Bookmark", Bookmark],
  ["Bell", Bell],
  ["Mic", Mic],
  ["Share2", Share2],
  ["Clock", Clock],
  ["Grid2x2", Grid2x2],
  ["Map", MapIcon],
  ["Galaxy", Galaxy],
  ["Sparkles", Sparkles],
  ["Archive", Archive],
  ["Check", Check],
  ["Plus", Plus],
  ["X", X],
] as const;

const LIVE_VARS = [
  ...COLOUR_TOKENS.map((t) => t.cssVar),
  ...ACCENT_TOKENS.map((t) => t.cssVar),
  ...SPACE_COLORS.map(spaceVar),
];

/* ------------------------------------------------------------ helpers */

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-56 border-t border-line pt-8">
      <h2 id={`${id}-h`} className="text-title">
        <a href={`#${id}`} className="hover:underline">
          {title}
        </a>
      </h2>
      {intro && <p className="mt-1 max-w-2xl text-body text-fg-muted">{intro}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-body text-label text-fg-muted">{title}</h3>
      {children}
    </div>
  );
}

function Swatch({ cssVar, className }: { cssVar: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("block h-12 w-12 shrink-0 rounded-sm border border-line", className)}
      style={{ background: `var(${cssVar})` }}
    />
  );
}

/* ------------------------------------------------------------ sections */

function Colours({ live }: { live: Record<string, string> }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {COLOUR_TOKENS.map((t) => (
        <li key={t.cssVar} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
          <Swatch cssVar={t.cssVar} />
          <span className="flex min-w-0 flex-col">
            <span className="text-label">{t.name}</span>
            <code className="break-all text-caption text-fg-muted">
              {t.cssVar} · {t.utility}
            </code>
            <code className="text-caption text-fg-muted">{live[t.cssVar] || "…"}</code>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SpacePalette({ live }: { live: Record<string, string> }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {SPACE_COLORS.map((c) => (
        <li key={c} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className={cx("h-12 w-12 rounded-sm", SPACE_BG[c])} />
            <span aria-hidden className={cx("h-12 w-12 rounded-sm border border-line", SPACE_TINT[c])} />
            <span className="flex min-w-0 flex-col">
              <span className="text-label">{SPACE_LABEL[c]}</span>
              <code className="break-all text-caption text-fg-muted">
                {spaceVar(c)} · {live[spaceVar(c)] || "…"}
              </code>
              <code className="text-caption text-fg-muted">tint = 15% over surface</code>
            </span>
          </div>
          <SpaceChip name={c === "inbox" ? "Inbox" : SPACE_LABEL[c]} color={c} count={7} />
        </li>
      ))}
    </ul>
  );
}

function Accents({ live }: { live: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-wrap gap-4">
        {ACCENT_TOKENS.map((t) => (
          <li key={t.cssVar} className="flex w-36 flex-col gap-2">
            <span aria-hidden className="h-16 rounded-card border border-line" style={{ background: `var(${t.cssVar})` }} />
            <span className="text-label">{t.name}</span>
            <code className="break-all text-caption text-fg-muted">
              {t.cssVar} · {live[t.cssVar] || "…"}
            </code>
          </li>
        ))}
      </ul>
      <p className="max-w-2xl text-body text-fg-muted">
        Accent means &quot;act now&quot;: Play, Start, primary buttons, Undo and due items. Pick a custom colour in the header to
        see the contrast and Space-clash checks.
      </p>
    </div>
  );
}

function Typography() {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {TYPE_STYLES.map((t) => (
        <li key={t.name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6">
          <span className="flex w-56 shrink-0 flex-col">
            <span className="text-label">{t.name}</span>
            <code className="text-caption text-fg-muted">{t.spec}</code>
          </span>
          <span className={cx("min-w-0 break-words", t.cls)}>{t.sample}</span>
        </li>
      ))}
    </ul>
  );
}

function Spacing() {
  return (
    <ul className="flex flex-col gap-2">
      {SPACING.map((s) => (
        <li key={s.step} className="flex items-center gap-4">
          <code className="w-28 shrink-0 text-caption text-fg-muted">
            --space-{s.step} · {s.px}px
          </code>
          <span aria-hidden className={cx("h-6 rounded-sm bg-fg", s.cls)} />
        </li>
      ))}
    </ul>
  );
}

function Radii() {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {RADII.map((r) => (
        <li key={r.name} className="flex flex-col gap-2">
          <span aria-hidden className={cx("h-20 border border-line bg-raised", r.cls)} />
          <span className="text-label">rounded-{r.name}</span>
          <code className="text-caption text-fg-muted">
            {r.px === 9999 ? "pill" : `${r.px}px`} · {r.use}
          </code>
        </li>
      ))}
    </ul>
  );
}

function Motion() {
  const motionOK = useMotionOK();
  const [end, setEnd] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {DURATIONS.map((d) => (
          <li key={d.name} className="flex flex-col gap-1">
            <code className="text-caption text-fg-muted">
              {d.cssVar} · {d.ms}ms · {d.use}
            </code>
            <div className={cx("flex h-12 items-center rounded-card bg-raised px-1", end ? "justify-end" : "justify-start")}>
              <motion.span
                layout
                aria-hidden
                className="block h-10 w-10 rounded-sm bg-fg"
                transition={
                  !motionOK
                    ? { duration: 0 }
                    : d.name === "sheet"
                      ? { type: "spring", stiffness: 380, damping: 36, mass: 0.9 }
                      : { duration: d.ms / 1000, ease: [0.2, 0, 0, 1] }
                }
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={Play} onClick={() => setEnd((v) => !v)}>
          Run motion demo
        </Button>
        {!motionOK && <span className="text-caption text-fg-muted">Reduce motion is on: changes are instant.</span>}
      </div>
    </div>
  );
}

function Icons() {
  return (
    <ul className="grid grid-cols-4 gap-3 sm:grid-cols-8">
      {ICONS.map(([name, Icon]) => (
        <li key={name} className="flex flex-col items-center gap-1 rounded-card border border-line bg-surface p-3">
          <Icon size={24} strokeWidth={2} aria-hidden />
          <code className="max-w-full truncate text-caption text-fg-muted">{name}</code>
        </li>
      ))}
    </ul>
  );
}

function Components() {
  const { toast } = useToast();
  const [chips, setChips] = useState<string[]>(["Unwatched"]);
  const [space, setSpace] = useState<SpaceColor>("teal");
  const [speed, setSpeed] = useState<"1" | "1.5" | "2">("1");
  const [lens, setLens] = useState<"grid" | "map" | "galaxy">("grid");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [size, setSize] = useState(100);
  const [sheet, setSheet] = useState(false);
  const [processing, setProcessing] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [longPressed, setLongPressed] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggleChip = (c: string) => setChips((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <div className="flex flex-col gap-10">
      <Sub title="Button · variants">
        <div className="flex flex-wrap gap-3">
          <Button icon={Play}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={Trash2}>
            Delete
          </Button>
        </div>
      </Sub>
      <Sub title="Button · sizes and states">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="md">Medium 48</Button>
          <Button size="lg" icon={Play}>
            Large 56
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button loading>Saving</Button>
          <Button variant="secondary" loading>
            Loading
          </Button>
        </div>
        <Button fullWidth icon={Play} size="lg">
          Full width · Start · 6 min
        </Button>
      </Sub>

      <Sub title="IconButton · plain, raised, accent, pressed, disabled">
        <div className="flex flex-wrap gap-3">
          <IconButton label="Search" icon={Search} />
          <IconButton label="Close" icon={X} variant="raised" />
          <IconButton label="Play" icon={Play} variant="accent" />
          <IconButton label="Captions" icon={Captions} pressed />
          <IconButton label="More" icon={ChevronDown} variant="raised" disabled />
        </div>
      </Sub>

      <Sub title="Chip · tap to toggle">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip label="Inbox" count={4} dot="inbox" selected={chips.includes("Inbox")} onClick={() => toggleChip("Inbox")} />
          {["Unwatched", "Kept", "Applied", "Places"].map((c) => (
            <Chip key={c} label={c} selected={chips.includes(c)} onClick={() => toggleChip(c)} />
          ))}
          <Chip label="TikTok" count={31} selected={chips.includes("TikTok")} onClick={() => toggleChip("TikTok")} />
        </div>
      </Sub>

      <Sub title="SpaceChip · tap to select, long-press to change colour">
        <div className="flex flex-wrap gap-2">
          {(["violet", "teal", "amber"] as const).map((c) => (
            <SpaceChip
              key={c}
              name={c === "violet" ? "Marketing" : c === "teal" ? "Fitness" : "Food spots"}
              color={c}
              count={c === "violet" ? 23 : 8}
              selected={space === c}
              onClick={() => setSpace(c)}
              onLongPress={() => setLongPressed(SPACE_LABEL[c])}
            />
          ))}
          <SpaceChip name="Travel" color="cyan" suggested />
          <SpaceChip name="Inbox" color="inbox" count={4} />
        </div>
        <p className="text-caption text-fg-muted" aria-live="polite">
          {longPressed ? `Long-pressed ${longPressed}: the colour picker would open.` : "Hold a chip for half a second."}
        </p>
      </Sub>

      <Sub title="Card · plain, Space top edge, large">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-label">Plain card</p>
            <p className="text-caption text-fg-muted">Surface, border, 14px radius.</p>
          </Card>
          <Card spaceColor="rose">
            <p className="text-label">Space edge</p>
            <p className="text-caption text-fg-muted">3px top edge in the Space colour.</p>
          </Card>
          <Card size="lg" spaceColor="green">
            <AiLabel text="Pattern spotted" />
            <p className="mt-1 text-body">3 saves this week say the same thing about hooks.</p>
          </Card>
        </div>
      </Sub>

      <Sub title="Thumbnail · ready, unwatched, processing">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Thumbnail
            spaceColor="violet"
            duration={42}
            unwatched
            keyIdea="Open with the result, then show how you got there."
            label="Marketing save, 0:42"
            onClick={() => toast({ message: "Would open the player" })}
          />
          <Thumbnail spaceColor="amber" duration={95} keyIdea="Order the lamb tagine at Dar Zellij, ask for extra bread." />
          <Thumbnail spaceColor="teal" duration={28} loading />
          <div className="flex flex-col gap-2">
            <Thumbnail
              spaceColor="blue"
              duration={61}
              loading={processing}
              reveal={revealed}
              keyIdea="Batch your content on Sunday so weekdays stay for replies."
            />
            <Button
              variant="secondary"
              onClick={() => {
                setRevealed(processing);
                setProcessing((p) => !p);
              }}
            >
              {processing ? "Finish" : "Reset"}
            </Button>
          </div>
        </div>
      </Sub>

      <Sub title="Skeleton · line, block, circle, thumb">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[1fr_auto_8rem]">
          <div className="flex flex-col gap-2">
            <Skeleton shape="line" />
            <Skeleton shape="line" className="w-2/3" />
            <Skeleton shape="block" />
          </div>
          <Skeleton shape="circle" />
          <Skeleton shape="thumb" className="w-32" />
        </div>
      </Sub>

      <Sub title="Segmented">
        <div className="flex flex-wrap gap-4">
          <Segmented
            label="Playback speed"
            options={[
              { value: "1", label: "1×" },
              { value: "1.5", label: "1.5×" },
              { value: "2", label: "2×" },
            ]}
            value={speed}
            onChange={setSpeed}
          />
          <Segmented
            label="Library view"
            iconOnly
            options={[
              { value: "grid", label: "Grid", icon: Grid2x2 },
              { value: "map", label: "Map", icon: MapIcon },
              { value: "galaxy", label: "Galaxy", icon: Galaxy },
            ]}
            value={lens}
            onChange={setLens}
          />
        </div>
      </Sub>

      <Sub title="Switch · on, off, disabled">
        <div className="flex max-w-md flex-col">
          <Switch label="Captions" description="From the transcript." checked={on} onChange={setOn} />
          <Switch label="Only applied and kept saves" checked={off} onChange={setOff} />
          <Switch label="Disabled" checked={false} onChange={() => {}} disabled />
        </div>
      </Sub>

      <Sub title="ProgressSegments · text colour, accent, on accent">
        <div className="flex max-w-md flex-col gap-4">
          <ProgressSegments total={5} filled={3} label="3 of 5 this week" />
          <ProgressSegments total={5} filled={3} accent label="3 of 5 this week" />
          <div className="rounded-card bg-accent p-3">
            <ProgressSegments total={5} filled={2} onAccent label="2 of 5 played" />
          </div>
        </div>
      </Sub>

      <Sub title="Banner · offline, info">
        <div className="flex max-w-md flex-col gap-3">
          <Banner variant="offline">You&apos;re offline. Saves sync when you&apos;re back.</Banner>
          <Banner
            variant="info"
            action={
              <Button variant="ghost" className="-my-1">
                Retry
              </Button>
            }
          >
            Download failed. Showing the embed.
          </Banner>
        </div>
      </Sub>

      <Sub title="TextField">
        <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Space name" placeholder="Marketing" hint="You can change it later." />
          <TextField label="Due date" defaultValue="31 Feb" error="That date doesn't exist." />
        </div>
      </Sub>

      <Sub title="AiLabel">
        <div className="flex flex-wrap gap-4">
          <AiLabel text="Pattern spotted" />
          <AiLabel text="Suggested Space" />
        </div>
      </Sub>

      <Sub title="EmptyState">
        <Card size="lg" padded={false} className="max-w-md">
          <EmptyState
            icon={Share2}
            message="Share a reel to Stash to start."
            actionLabel={saved ? "Saved" : "Try a sample save"}
            actionIcon={saved ? Check : Plus}
            onAction={() => setSaved(true)}
          />
        </Card>
      </Sub>

      <Sub title="Slider">
        <Slider label="Text size" value={size} onChange={setSize} className="max-w-md" />
      </Sub>

      <Sub title="Sheet and Toast">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Open sheet
          </Button>
          <Button
            variant="secondary"
            icon={Archive}
            onClick={() =>
              toast({
                message: "Archived",
                actionLabel: "Undo",
                onAction: () => toast({ message: "Back in your Library", duration: 2000 }),
              })
            }
          >
            Show toast
          </Button>
        </div>
      </Sub>

      <Sheet open={sheet} onClose={() => setSheet(false)} label="Add to a Space" title="Add to a Space">
        <p className="text-body text-fg-muted">Drag the handle down, tap outside, press Escape or use back to close.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SpaceChip name="Marketing" color="violet" onClick={() => setSheet(false)} />
          <SpaceChip name="Fitness" color="teal" onClick={() => setSheet(false)} />
          <SpaceChip name="Travel" color="cyan" suggested onClick={() => setSheet(false)} />
          <Chip label="New" onClick={() => setSheet(false)} />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <TextField label="Why I saved it" placeholder="Optional note" />
          <Button fullWidth onClick={() => setSheet(false)}>
            Done
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------ themes */

function ThemeSample() {
  return (
    <div className="flex flex-col gap-4">
      <PreviewCard />
      <div className="flex flex-wrap gap-2">
        <Button icon={Play}>Play</Button>
        <Button variant="secondary">Export</Button>
      </div>
      <div className="flex flex-wrap">
        <Chip label="Unwatched" selected />
        <Chip label="Kept" count={9} className="ml-2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Thumbnail spaceColor="teal" duration={34} unwatched keyIdea="Film in daylight facing the window." />
        <Card spaceColor="rose" className="flex flex-col justify-between gap-2">
          <AiLabel text="Pattern spotted" />
          <p className="text-caption text-fg-muted">4 saves agree</p>
          <ProgressSegments total={5} filled={3} label="3 of 5" />
        </Card>
      </div>
    </div>
  );
}

function AllThemes() {
  const system = useSystemTheme();
  const panels: Array<{ theme: "light" | "dark" | "black"; title: string; note: string }> = [
    { theme: system, title: "System", note: `Follows the OS. Right now: ${system === "dark" ? "Dark" : "Light"}.` },
    { theme: "light", title: "Light", note: "Default." },
    { theme: "dark", title: "Dark", note: "Dark surfaces, lighter Space colours." },
    { theme: "black", title: "Black", note: "AMOLED: pure black background." },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {panels.map((p) => (
        <div
          key={p.title}
          data-theme={p.theme}
          className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-background p-4 text-fg"
        >
          <div>
            <h3 className="text-heading">{p.title}</h3>
            <p className="text-caption text-fg-muted">{p.note}</p>
          </div>
          <ThemeSample />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ board */

export function DesignBoard() {
  const live = useLiveTokens(LIVE_VARS);
  const { appearance } = useAppearance();

  return (
    <div className="min-h-dvh bg-background text-fg">
      <header className="sticky top-0 z-40 border-b border-line bg-background/95 pt-safe backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex items-baseline justify-between gap-3 lg:flex-col lg:items-start lg:gap-0">
            <h1 className="text-title">Design system</h1>
            <span className="text-caption text-fg-muted">
              {appearance.theme} · {appearance.accent}
            </span>
          </div>
          <ThemePicker className="lg:max-w-md" />
          <AccentPicker className="lg:ml-auto" />
        </div>
      </header>

      <nav aria-label="Sections" className="mx-auto max-w-6xl px-4">
        <ul className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 py-2">
          {SECTIONS.map(([id, title]) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                className="inline-flex h-12 items-center rounded-full px-3 text-label text-fg-muted hover:bg-raised hover:text-fg"
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-32 pt-2">
        <p className="max-w-2xl text-body text-fg-muted">
          Every colour, type style and shape below comes from styles/tokens.css. Switch theme or accent in the header: the
          whole page restyles instantly, and hex values update to the current theme.
        </p>
        <Section id="colours" title="Colours" intro="Core tokens with their CSS variable, Tailwind utility and live value.">
          <Colours live={live} />
        </Section>
        <Section id="spaces" title="Space palette" intro="Colour, tint (chip background) and a Space chip for each.">
          <SpacePalette live={live} />
        </Section>
        <Section id="accents" title="Accent presets">
          <Accents live={live} />
        </Section>
        <Section id="type" title="Typography" intro="Sizes are in rem, so the system font scale and the text size setting apply.">
          <Typography />
        </Section>
        <Section id="spacing" title="Spacing" intro="4px grid. Tailwind p-4 = 16px.">
          <Spacing />
        </Section>
        <Section id="radii" title="Radii">
          <Radii />
        </Section>
        <Section id="motion" title="Motion" intro="Durations drop to 0 when reduce motion is on, from the OS or the app.">
          <Motion />
        </Section>
        <Section id="icons" title="Icons" intro="lucide-react only, 24px, stroke 2.">
          <Icons />
        </Section>
        <Section id="components" title="Components">
          <Components />
        </Section>
        <Section
          id="themes"
          title="All themes side by side"
          intro="Each panel sets data-theme on its own element, so it renders in that theme whatever the page uses. The accent follows your current pick."
        >
          <AllThemes />
        </Section>
      </main>
    </div>
  );
}
