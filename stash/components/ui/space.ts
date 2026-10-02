// The 9 Space palette keys and their Tailwind classes. Classes are spelled out
// in full so Tailwind can see them; every one maps to a token in tokens.css.

export const SPACE_COLORS = ["violet", "teal", "amber", "blue", "rose", "green", "cyan", "sand", "inbox"] as const;
export type SpaceColor = (typeof SPACE_COLORS)[number];

export const SPACE_LABEL: Record<SpaceColor, string> = {
  violet: "Violet",
  teal: "Teal",
  amber: "Amber",
  blue: "Blue",
  rose: "Rose",
  green: "Green",
  cyan: "Cyan",
  sand: "Sand",
  inbox: "Inbox grey",
};

export const SPACE_BG: Record<SpaceColor, string> = {
  violet: "bg-space-violet",
  teal: "bg-space-teal",
  amber: "bg-space-amber",
  blue: "bg-space-blue",
  rose: "bg-space-rose",
  green: "bg-space-green",
  cyan: "bg-space-cyan",
  sand: "bg-space-sand",
  inbox: "bg-space-inbox",
};

export const SPACE_TINT: Record<SpaceColor, string> = {
  violet: "bg-space-violet-tint",
  teal: "bg-space-teal-tint",
  amber: "bg-space-amber-tint",
  blue: "bg-space-blue-tint",
  rose: "bg-space-rose-tint",
  green: "bg-space-green-tint",
  cyan: "bg-space-cyan-tint",
  sand: "bg-space-sand-tint",
  inbox: "bg-space-inbox-tint",
};

export const SPACE_TEXT: Record<SpaceColor, string> = {
  violet: "text-space-violet",
  teal: "text-space-teal",
  amber: "text-space-amber",
  blue: "text-space-blue",
  rose: "text-space-rose",
  green: "text-space-green",
  cyan: "text-space-cyan",
  sand: "text-space-sand",
  inbox: "text-space-inbox",
};

export const SPACE_BORDER: Record<SpaceColor, string> = {
  violet: "border-space-violet",
  teal: "border-space-teal",
  amber: "border-space-amber",
  blue: "border-space-blue",
  rose: "border-space-rose",
  green: "border-space-green",
  cyan: "border-space-cyan",
  sand: "border-space-sand",
  inbox: "border-space-inbox",
};

/** CSS custom property name for a Space colour, e.g. "--space-teal". */
export const spaceVar = (c: SpaceColor) => `--space-${c}`;
