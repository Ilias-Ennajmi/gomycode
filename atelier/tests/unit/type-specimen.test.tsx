import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectLayer } from "@/components/canvas/ObjectLayer";
import { TypeSpecimenView } from "@/components/canvas/objects/TypeSpecimenView";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { FALLBACK_STACK, FontLoader, resetFontLoader } from "@/lib/engine/fonts/font-loader";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject, TypeSpecimenObj } from "@/lib/engine/model/types";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";

const noAssets: AssetResolver = { url: () => null, available: () => null };

const specimen = (extra: Partial<TypeSpecimenObj> = {}): TypeSpecimenObj =>
  ({ ...defaultsFor("typeSpecimen"), id: "s1", index: "a0", createdAt: 0, updatedAt: 0, ...extra }) as TypeSpecimenObj;

/** A loader whose network is "offline": every request fails. */
function offlineLoader() {
  const fetchFn = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
  return { loader: new FontLoader({ fetch: fetchFn as unknown as typeof fetch }), fetchFn };
}

beforeEach(() => resetFontLoader());
afterEach(() => {
  vi.unstubAllGlobals();
  resetFontLoader();
});

describe("TypeSpecimenView", () => {
  it("shows the sample at its size, weight and family with a system fallback stack", () => {
    const { loader } = offlineLoader();
    render(<TypeSpecimenView obj={specimen({ family: "Playfair Display", weight: 700, italic: true, size: 52, sample: "Hello" })} loader={loader} />);
    const sample = screen.getByText("Hello");
    expect(sample.style.fontSize).toBe("52px");
    expect(sample.style.fontWeight).toBe("700");
    expect(sample.style.fontStyle).toBe("italic");
    expect(sample.style.fontFamily).toContain("Playfair Display");
    expect(sample.style.fontFamily).toContain(FALLBACK_STACK.split(",")[0]);
    expect(screen.getByText("Playfair Display", { exact: false })).toBeTruthy();
  });

  it("renders a hostile sample as plain text, never as markup", () => {
    const { loader } = offlineLoader();
    const evil = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>';
    const { container } = render(<TypeSpecimenView obj={specimen({ sample: evil })} loader={loader} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(evil)).toBeTruthy();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("shows 'Font unavailable offline' (text, not colour alone) when the network fails", async () => {
    const { loader } = offlineLoader();
    render(<TypeSpecimenView obj={specimen({ family: "Lora" })} loader={loader} />);
    await waitFor(() => expect(screen.getByText("Font unavailable offline")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("Font unavailable offline");
  });

  it("shows 'Font not found' when the family does not exist", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response("", { status: 400 })));
    const loader = new FontLoader({ fetch: fetchFn as unknown as typeof fetch });
    render(<TypeSpecimenView obj={specimen({ family: "Nopeface" })} loader={loader} />);
    await waitFor(() => expect(screen.getByText("Font not found")).toBeTruthy());
  });

  it("makes no request for an invalid or empty family and says so", () => {
    const { loader, fetchFn } = offlineLoader();
    render(<TypeSpecimenView obj={specimen({ family: "Inter; } body{" })} loader={loader} />);
    render(<TypeSpecimenView obj={specimen({ id: "s2", family: "" })} loader={loader} />);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByText("Not a valid font name")).toBeTruthy();
  });

  it("shows the licence note and a safe source link only for http(s) URLs", () => {
    const { loader } = offlineLoader();
    const { rerender } = render(<TypeSpecimenView obj={specimen({ licenceNote: "SIL OFL 1.1", sourceUrl: "https://fonts.google.com/specimen/Lora" })} loader={loader} />);
    expect(screen.getByText("SIL OFL 1.1")).toBeTruthy();
    const a = screen.getByRole("link", { name: /source/i }) as HTMLAnchorElement;
    expect(a.href).toBe("https://fonts.google.com/specimen/Lora");
    expect(a.rel).toContain("noopener");
    expect(a.rel).toContain("noreferrer");
    rerender(<TypeSpecimenView obj={specimen({ sourceUrl: "javascript:alert(1)" })} loader={loader} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("is never autofocusable by itself and exposes a descriptive label", () => {
    const { loader } = offlineLoader();
    const { container } = render(<TypeSpecimenView obj={specimen({ family: "Lora" })} loader={loader} />);
    expect(container.firstElementChild?.getAttribute("aria-label")).toContain("Lora");
  });
});

describe("on-demand loading through the object layer", () => {
  const layer = (doc: BoardDoc, camera = { x: 0, y: 0, z: 1 }) => (
    <ObjectLayer doc={doc} index={new SpatialIndex(doc)} assets={noAssets} view={{ camera, viewport: { w: 1000, h: 800 } }} />
  );

  it("a board with no specimens never calls fetch", async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error("no")));
    vi.stubGlobal("fetch", fetchFn);
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("sticky"), id: "st", x: 10, y: 10 } as NewObject);
    render(layer(doc));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("requests only the families of specimens that are on screen", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((u: string) => {
      urls.push(u);
      return Promise.reject(new TypeError("offline"));
    }));
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("typeSpecimen"), id: "near", family: "Lora", x: 20, y: 20 } as NewObject);
    doc.create({ ...defaultsFor("typeSpecimen"), id: "far", family: "Merriweather", x: 90_000, y: 90_000 } as NewObject);
    const { container } = render(layer(doc));
    await waitFor(() => expect(urls).toHaveLength(1));
    expect(urls[0]).toContain("family=Lora");
    expect(container.querySelector('[data-object-id="far"]')).toBeNull();

    // Scroll to the far one: only now does its family get requested.
    render(layer(doc, { x: 90_000 - 100, y: 90_000 - 100, z: 1 }));
    await waitFor(() => expect(urls.some((u) => u.includes("family=Merriweather"))).toBe(true));
  });

  it("two specimens of one family share a single request", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((u: string) => {
      urls.push(u);
      return Promise.reject(new TypeError("offline"));
    }));
    const doc = new BoardDoc();
    doc.create({ ...defaultsFor("typeSpecimen"), id: "a", family: "Lora", x: 20, y: 20 } as NewObject);
    doc.create({ ...defaultsFor("typeSpecimen"), id: "b", family: "Lora", x: 420, y: 20 } as NewObject);
    render(layer(doc));
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(urls).toHaveLength(1);
  });
});
