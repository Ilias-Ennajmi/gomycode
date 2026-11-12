// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAND,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  getTheme,
  parseTheme,
  resolveTheme,
  setTheme,
  watchSystemTheme,
} from "@/lib/theme";

type Listener = (e: { matches: boolean }) => void;

/** A controllable prefers-color-scheme. */
function mockSystem(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();
  vi.stubGlobal("matchMedia", (q: string) => ({
    get matches() {
      return q.includes("dark") ? dark : !dark;
    },
    media: q,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }));
  return {
    flip(next: boolean) {
      dark = next;
      listeners.forEach((l) => l({ matches: next }));
    },
    listeners,
  };
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.unstubAllGlobals());

describe("parseTheme", () => {
  it("accepts the three preferences and nothing else", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    for (const bad of ["", "Dark", "auto", null, undefined, 1, {}]) expect(parseTheme(bad)).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("follows the system only for 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("getTheme", () => {
  it("is 'system' without a stored preference", () => {
    expect(getTheme()).toBe("system");
  });
  it("returns the stored preference", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getTheme()).toBe("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getTheme()).toBe("light");
  });
  it("ignores garbage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(getTheme()).toBe("system");
  });
  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    expect(getTheme()).toBe("system");
    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark"); // still applied for this visit
  });
});

describe("applyTheme / setTheme", () => {
  it("sets data-theme on <html> from the preference and the system", () => {
    mockSystem(true);
    expect(applyTheme("system")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(applyTheme("light")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("setTheme stores and applies", () => {
    mockSystem(false);
    setTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    setTheme("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("applyTheme without matchMedia falls back to light", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(applyTheme("system")).toBe("light");
  });
});

describe("watchSystemTheme", () => {
  it("re-applies when the system changes, only while the preference is 'system'", () => {
    const sys = mockSystem(false);
    const stop = watchSystemTheme();
    applyTheme("system");
    sys.flip(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    setTheme("light");
    sys.flip(false);
    sys.flip(true);
    expect(document.documentElement.dataset.theme).toBe("light"); // an explicit choice wins
    stop();
    expect(sys.listeners.size).toBe(0);
  });
});

describe("pre-paint script", () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it("uses the stored choice over the system", () => {
    mockSystem(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    run();
    expect(document.documentElement.dataset.theme).toBe("light");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    mockSystem(false);
    run();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("follows the system for 'system' and for nothing stored", () => {
    mockSystem(true);
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    run();
    expect(document.documentElement.dataset.theme).toBe("dark");
    localStorage.clear();
    mockSystem(false);
    run();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("keeps following the system when storage throws", () => {
    mockSystem(true);
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
    });
    run();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("defaults to light when nothing at all is available", () => {
    vi.stubGlobal("matchMedia", undefined);
    vi.stubGlobal("localStorage", undefined);
    run();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("is one short inline script that uses the same storage key", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT.length).toBeLessThan(500);
  });
});

describe("BRAND", () => {
  it("holds the paper and ink colours the manifest and meta tags use", () => {
    expect(BRAND.paper).toBe("#F5F2EC");
    expect(BRAND.ink).toBe("#141414");
  });
});

describe("BRAND vs tokens.css", () => {
  it("matches the canvas paper in both themes", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/styles/tokens.css`, "utf8").toLowerCase();
    expect(css).toContain(`--color-bg: ${BRAND.paper.toLowerCase()}`);
    expect(css).toContain(`--color-bg: ${BRAND.paperDark.toLowerCase()}`);
    expect(css).toContain(`--color-ink: ${BRAND.ink.toLowerCase()}`);
  });
});
