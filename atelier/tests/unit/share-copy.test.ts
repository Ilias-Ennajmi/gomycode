// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "@/lib/share/copy";
import { qrDataUrl } from "@/lib/share/qr";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("copyText", () => {
  it("uses the clipboard API when it is there", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const input = document.createElement("input");
    expect(await copyText("hello", input)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to selecting the field and execCommand when the API is missing or refuses", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    const input = document.createElement("input");
    input.value = "hello";
    document.body.append(input);
    const select = vi.spyOn(input, "select");
    document.execCommand = vi.fn(() => true);
    expect(await copyText("hello", input)).toBe("copied");
    expect(select).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("when nothing can copy the text is left selected and the caller is told to copy by hand", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    const input = document.createElement("input");
    input.value = "hello";
    document.body.append(input);
    document.execCommand = vi.fn(() => false);
    expect(await copyText("hello", input)).toBe("select");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
  });

  it("never throws, even without a field", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    document.execCommand = vi.fn(() => { throw new Error("x"); });
    expect(await copyText("hello", null)).toBe("select");
  });
});

describe("qrDataUrl", () => {
  it("makes an SVG data URL for a link, dark on light so phones can scan it in either theme", async () => {
    const url = await qrDataUrl("https://atelier.example.com/s/abc");
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    const svg = decodeURIComponent(url.slice("data:image/svg+xml;charset=utf-8,".length));
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/<script|onload/i);
  });
});
