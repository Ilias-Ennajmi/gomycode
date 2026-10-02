// Space palette names. Colours themselves live in styles/tokens.css as
// --space-<name> / --space-<name>-tint; components reference them by name.
export const SPACE_COLORS = ["violet", "teal", "amber", "blue", "rose", "green", "cyan", "sand", "inbox"] as const;
export type SpaceColor = (typeof SPACE_COLORS)[number];

export const spaceVar = (c: SpaceColor) => `var(--space-${c})`;
export const spaceTintVar = (c: SpaceColor) => `var(--space-${c}-tint)`;

export function isSpaceColor(v: unknown): v is SpaceColor {
  return typeof v === "string" && (SPACE_COLORS as readonly string[]).includes(v);
}
