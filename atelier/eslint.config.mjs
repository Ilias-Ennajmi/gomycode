import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * The client-facing share page ships to a visitor's phone: no Yjs, no Tiptap, no PDF or zip code, no editor stores or document
 * model (docs/plans/2026-11-12-phase-3-present-and-share.md, Global Constraints; JS budget < 200 KB gzipped, checked by
 * `npm run check:share-bundle`). The viewer draws the server's plain ViewerBoard JSON with its own components.
 */
const SHARE_BANNED = {
  paths: ["yjs", "jspdf", "fflate", "hash-wasm", "svg2pdf.js", "pixi.js"].map((name) => ({ name, message: "Not allowed in the share viewer (bundle budget and no-Yjs rule)." })),
  patterns: [
    { group: ["yjs/*", "y-*", "@tiptap/*"], message: "Not allowed in the share viewer (no Yjs or Tiptap)." },
    { group: ["**/lib/engine/doc/**", "@/lib/engine/doc/**"], message: "The viewer never touches the Yjs document model." },
    { group: ["**/lib/engine/export/**", "@/lib/engine/export/**"], message: "Export code is for the owner; load it with dynamic import() only." },
    { group: ["**/components/editor/**", "@/components/editor/**"], message: "Editor components are not part of the viewer." },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reports written by Playwright
    "playwright-report/**",
    "test-results/**",
    // One-off Node script (CommonJS) for the logo build
    "scripts/**",
  ]),
  {
    // The page itself is a server component: it may call the server library; everything it imports for the browser may not.
    files: ["app/s/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", SHARE_BANNED] },
  },
  {
    // Browser code of the viewer must not reach into the server library either (types are fine: they are erased).
    files: ["components/viewer/**/*.{ts,tsx}", "lib/viewer/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { ...SHARE_BANNED, patterns: [...SHARE_BANNED.patterns, { group: ["**/lib/server/**", "@/lib/server/**"], allowTypeImports: true, message: "Server code is not part of the browser bundle." }] },
      ],
    },
  },
]);

export default eslintConfig;
