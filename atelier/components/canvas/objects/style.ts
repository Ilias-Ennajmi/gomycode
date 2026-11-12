const COLOR_PATTERNS = [
  /^var\(--[a-z0-9-]+\)$/i,
  /^#[0-9a-f]{3,8}$/i,
  /^(rgb|rgba|hsl|hsla)\([0-9.,%\s/-]+\)$/i,
  /^[a-z]{3,24}$/i, // keywords: transparent, currentcolor, named colours
];

/**
 * Colours on objects are user data. Only token references, hex/rgb/hsl values and keywords are passed to CSS and SVG;
 * anything else (url(...), expressions) falls back, so a stored value can never load a resource.
 */
export function safeColor(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  return COLOR_PATTERNS.some((re) => re.test(v)) ? v : fallback;
}

export function dashArray(style: "solid" | "dashed" | "dotted", width: number): string | undefined {
  const w = Math.max(width, 1);
  if (style === "dashed") return `${w * 3} ${w * 2}`;
  if (style === "dotted") return `${w * 0.1} ${w * 2}`;
  return undefined;
}
