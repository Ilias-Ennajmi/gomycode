import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Two environments: pure-logic tests (*.test.ts) run in node; component and hook tests
// (*.test.tsx) run in jsdom. A .ts test that needs the DOM can opt in with a
// `// @vitest-environment jsdom` docblock.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/node.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: ["tests/setup/jsdom.ts"],
        },
      },
    ],
  },
});
