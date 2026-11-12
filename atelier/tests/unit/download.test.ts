// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, MAX_DOWNLOAD_BYTES, sanitizeFileName } from "@/lib/download";

describe("sanitizeFileName", () => {
  it("removes separators and control characters, keeps unicode, caps the length", () => {
    expect(sanitizeFileName("a/b\\c", "x")).toBe("a-b-c");
    expect(sanitizeFileName("../../etc/passwd", "x")).toBe("etc-passwd");
    expect(sanitizeFileName("ca\u0000fé 夕焼け ✨", "x")).toBe("café 夕焼け ✨");
    expect(Array.from(sanitizeFileName("é".repeat(300), "x")).length).toBeLessThanOrEqual(80);
    expect(sanitizeFileName("name.", "x")).toBe("name");
  });
  it("uses the fallback for nothing usable, and never returns a dot name or a reserved Windows name", () => {
    expect(sanitizeFileName("", "palette")).toBe("palette");
    expect(sanitizeFileName(" . . ", "palette")).toBe("palette");
    expect(sanitizeFileName("..", "palette")).toBe("palette");
    expect(sanitizeFileName("CON", "palette")).toBe("CON_");
    expect(sanitizeFileName('a:b*c?d"e<f>g|h', "x")).toBe("a-b-c-d-e-f-g-h");
  });
});

describe("downloadBlob", () => {
  let created: Blob[];
  let revoked: string[];
  let clicked: { href: string; download: string }[];

  beforeEach(() => {
    vi.useFakeTimers();
    created = [];
    revoked = [];
    clicked = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      created.push(b as Blob);
      return `blob:test/${created.length}`;
    });
    URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicks an anchor with the object URL and the file name, then revokes the URL and removes the anchor", () => {
    downloadBlob("palette.ase", new Uint8Array([1, 2, 3]), "application/octet-stream");
    expect(clicked).toEqual([{ href: "blob:test/1", download: "palette.ase" }]);
    expect(created[0].type).toBe("application/octet-stream");
    expect(created[0].size).toBe(3);
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
    vi.runAllTimers();
    expect(revoked).toEqual(["blob:test/1"]);
  });

  it("takes text and sanitises the file name", () => {
    downloadBlob("../x/y.css", ":root {}", "text/css");
    expect(clicked[0].download).toBe("x-y.css");
    expect(created[0].size).toBe(8);
  });

  it("refuses a download that is too large before creating anything", () => {
    const big = { length: MAX_DOWNLOAD_BYTES + 1 } as unknown as Uint8Array;
    expect(() => downloadBlob("big.bin", big, "application/octet-stream")).toThrow(RangeError);
    expect(created).toHaveLength(0);
  });

  it("revokes even when the click throws", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => downloadBlob("a.txt", "x", "text/plain")).toThrow("blocked");
    vi.runAllTimers();
    expect(revoked).toEqual(["blob:test/1"]);
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });
});
