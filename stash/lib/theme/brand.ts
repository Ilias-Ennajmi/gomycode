// The few places that need literal colours outside CSS (web manifest, viewport
// theme-color before CSS loads). They mirror styles/tokens.css; a unit test
// fails if they drift.
export const BRAND = {
  backgroundLight: "#f4f2eb",
  backgroundDark: "#0c0e16",
  backgroundBlack: "#000000",
  accent: "#c6ff34",
  /** The mark: lime on deep ink (tokens --brand-lime / --brand-ink). */
  lime: "#c6ff34",
  ink: "#0c0e16",
} as const;
