// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_STACK, FontLoader, googleFontsCssUrl, isValidFontName } from "@/lib/engine/fonts/font-loader";
import { searchFonts, POPULAR_FONTS } from "@/lib/engine/fonts/popular-fonts";

describe("isValidFontName", () => {
  it("accepts ordinary family names", () => {
    expect(isValidFontName("Playfair Display")).toBe(true);
    expect(isValidFontName("Inter")).toBe(true);
    expect(isValidFontName("  IBM Plex Sans  ")).toBe(true);
    expect(isValidFontName("Noto Sans-Display 2")).toBe(true);
  });
  it("rejects anything that could change the URL or the CSS", () => {
    for (const bad of ["Inter; } body{", "", "   ", "a".repeat(61), "Inter&family=Evil", "Inter/../x", "-Inter", "Inter\nBold", "Inter\"", "In<ter>", "http://x.test", "Interé"]) {
      expect(isValidFontName(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isValidFontName("a".repeat(60))).toBe(true);
  });
});

describe("googleFontsCssUrl", () => {
  it("builds the CSS2 URL with sorted, de-duplicated weights", () => {
    expect(googleFontsCssUrl("Playfair Display", [700, 400, 400], false)).toBe(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
    );
  });
  it("adds the ital axis in the required order when italic is requested", () => {
    expect(googleFontsCssUrl("Playfair Display", [700, 400], true)).toBe(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap",
    );
  });
  it("drops weights outside 100-900 and falls back to 400", () => {
    expect(googleFontsCssUrl("Inter", [50, 1000, 450.5, NaN, 300], false)).toBe("https://fonts.googleapis.com/css2?family=Inter:wght@300&display=swap");
    expect(googleFontsCssUrl("Inter", [], false)).toBe("https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap");
  });
  it("collapses runs of spaces and trims", () => {
    expect(googleFontsCssUrl("  Open   Sans ", [400], false)).toContain("family=Open+Sans:");
  });
  it("throws for a family that is not valid, so nothing unsafe reaches a URL", () => {
    expect(() => googleFontsCssUrl("Inter; } body{", [400], false)).toThrow();
    expect(() => googleFontsCssUrl("", [400], false)).toThrow();
  });
});

const ok = () => Promise.resolve(new Response("@font-face{}", { status: 200 }));

/** A FontLoader whose appended stylesheet links "finish loading" as soon as they are in the head. */
function setup(opts: { fetch?: typeof fetch; fonts?: boolean | { load: (spec: string) => Promise<unknown[]> } } = {}) {
  const fetchFn = vi.fn(opts.fetch ?? ok) as unknown as typeof fetch;
  const doc = document.implementation.createHTMLDocument("t");
  const append = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = ((n: Node) => {
    const r = append(n);
    if (n instanceof HTMLLinkElement) queueMicrotask(() => n.dispatchEvent(new Event("load")));
    return r;
  }) as typeof doc.head.appendChild;
  if (opts.fonts !== false) {
    const fonts = typeof opts.fonts === "object" ? opts.fonts : { load: vi.fn(async () => [{}]) };
    Object.defineProperty(doc, "fonts", { value: fonts, configurable: true });
  }
  const loader = new FontLoader({ fetch: fetchFn, doc });
  return { loader, fetchFn: fetchFn as unknown as ReturnType<typeof vi.fn>, doc };
}
const links = (doc: Document) => doc.head.querySelectorAll('link[rel="stylesheet"]');

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.useRealTimers());

describe("FontLoader", () => {
  it("starts idle", () => {
    expect(setup().loader.status("Inter")).toBe("idle");
  });

  it("loads once per family: a second request adds no second link", async () => {
    const { loader, doc } = setup();
    expect(await loader.load("Playfair Display", [400], false)).toBe("loaded");
    expect(await loader.load("Playfair Display", [400], false)).toBe("loaded");
    expect(links(doc)).toHaveLength(1);
    const link = links(doc)[0] as HTMLLinkElement;
    expect(link.href).toBe("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400&display=swap");
    expect(link.crossOrigin).toBe("anonymous");
    expect(loader.status("playfair display")).toBe("loaded");
  });

  it("two concurrent requests share one link and one probe", async () => {
    const { loader, doc, fetchFn } = setup();
    const [a, b] = await Promise.all([loader.load("Lora", [400], false), loader.load("Lora", [400], false)]);
    expect([a, b]).toEqual(["loaded", "loaded"]);
    expect(links(doc)).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("a further weight of the same family widens the single link instead of adding another", async () => {
    const { loader, doc } = setup();
    await loader.load("Lora", [400], false);
    await loader.load("Lora", [700], false);
    expect(links(doc)).toHaveLength(1);
    expect((links(doc)[0] as HTMLLinkElement).href).toContain("wght@400;700");
  });

  it("waits for each weight through document.fonts.load", async () => {
    const load = vi.fn(async () => [{}]);
    const { loader } = setup({ fonts: { load } });
    await loader.load("Lora", [400, 700], true);
    expect(load).toHaveBeenCalledWith('italic 400 1em "Lora"');
    expect(load).toHaveBeenCalledWith('italic 700 1em "Lora"');
  });

  it("a CSS endpoint 400 or 404 means not-found and leaves no link in the head", async () => {
    for (const status of [400, 404]) {
      const { loader, doc } = setup({ fetch: () => Promise.resolve(new Response("nope", { status })) });
      expect(await loader.load("Nopeface", [400], false)).toBe("not-found");
      expect(loader.status("Nopeface")).toBe("not-found");
      expect(links(doc)).toHaveLength(0);
    }
  });

  it("a network failure means fallback (offline) and leaves no link behind", async () => {
    const { loader, doc } = setup({ fetch: () => Promise.reject(new TypeError("Failed to fetch")) });
    expect(await loader.load("Lora", [400], false)).toBe("fallback");
    expect(loader.status("Lora")).toBe("fallback");
    expect(links(doc)).toHaveLength(0);
  });

  it("a 5xx from the CSS endpoint is treated as unavailable, not as a missing family", async () => {
    const { loader } = setup({ fetch: () => Promise.resolve(new Response("x", { status: 503 })) });
    expect(await loader.load("Lora", [400], false)).toBe("fallback");
  });

  it("gives up after 3 seconds without blocking: fallback", async () => {
    vi.useFakeTimers();
    const { loader } = setup({ fetch: () => new Promise(() => {}) });
    const p = loader.load("Lora", [400], false);
    expect(loader.status("Lora")).toBe("loading");
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toBe("fallback");
  });

  it("a stylesheet that never finishes loading ends in fallback", async () => {
    vi.useFakeTimers();
    const doc = document.implementation.createHTMLDocument("t");
    const loader = new FontLoader({ fetch: vi.fn(ok) as unknown as typeof fetch, doc });
    const p = loader.load("Lora", [400], false);
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toBe("fallback");
  });

  it("a font that the browser cannot match is a fallback", async () => {
    const { loader } = setup({ fonts: { load: async () => [] } });
    expect(await loader.load("Lora", [400], false)).toBe("fallback");
  });

  it("never touches the network for an invalid family name", async () => {
    const { loader, fetchFn, doc } = setup();
    expect(await loader.load("Inter; } body{", [400], false)).toBe("not-found");
    expect(await loader.load("", [400], false)).toBe("not-found");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(links(doc)).toHaveLength(0);
  });

  it("forget() removes the link and lets the family load again", async () => {
    const { loader, doc } = setup();
    await loader.load("Lora", [400], false);
    loader.forget("Lora");
    expect(links(doc)).toHaveLength(0);
    expect(loader.status("Lora")).toBe("idle");
    await loader.load("Lora", [400], false);
    expect(links(doc)).toHaveLength(1);
  });

  it("notifies subscribers when a status changes", async () => {
    const { loader } = setup();
    const seen: string[] = [];
    loader.subscribe(() => seen.push(loader.status("Lora")));
    await loader.load("Lora", [400], false);
    expect(seen).toContain("loading");
    expect(seen.at(-1)).toBe("loaded");
  });

  it("exposes a system fallback stack", () => {
    expect(FALLBACK_STACK).toBe('system-ui, -apple-system, "Segoe UI", sans-serif');
  });
});

describe("popular fonts list", () => {
  it("holds about 150 distinct, valid, URL-safe names", () => {
    expect(POPULAR_FONTS.length).toBeGreaterThanOrEqual(140);
    expect(new Set(POPULAR_FONTS.map((f) => f.toLowerCase())).size).toBe(POPULAR_FONTS.length);
    for (const f of POPULAR_FONTS) expect(isValidFontName(f), f).toBe(true);
  });
  it("searches by prefix first, then by substring, case-insensitively", () => {
    const r = searchFonts("play");
    expect(r[0]).toBe("Playfair Display");
    expect(searchFonts("SANS").every((n) => n.toLowerCase().includes("sans"))).toBe(true);
    expect(searchFonts("")).toHaveLength(8);
    expect(searchFonts("zzzzzzzz")).toEqual([]);
    expect(searchFonts("o", 5)).toHaveLength(5);
  });
});
