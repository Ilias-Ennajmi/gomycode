// The few places that need literal colours outside CSS (web manifest, viewport
// theme-color before CSS loads). They mirror styles/tokens.css; a unit test
// fails if they drift.
export const BRAND = {
  backgroundLight: "#f6f4ef",
  backgroundDark: "#0e0e10",
  accent: "#c8f05a",
} as const;
