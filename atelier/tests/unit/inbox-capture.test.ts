import { describe, expect, it, vi } from "vitest";
import { captureFiles, captureText, ingestShare } from "@/lib/inbox/capture";
import type { SharedPayload } from "@/lib/inbox/share-queue";
import type { NewInboxItem } from "@/lib/inbox/types";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const MB = 1024 * 1024;

function setup() {
  const added: NewInboxItem[] = [];
  const client = { add: vi.fn(async (i: NewInboxItem) => void added.push(i)) };
  let n = 0;
  const uploader = { addAssetOnly: vi.fn(async (...args: [Blob, unknown?]) => {
      void args;
      return `${A.slice(0, -2)}${String(++n).padStart(2, "0")}`;
    }) };
  return { added, client, uploader };
}
const file = (name: string, type: string, size = 10) => {
  const f = new File([new Uint8Array(Math.min(size, 64))], name, { type });
  if (size > 64) Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("captureText", () => {
  it("a lone web address becomes a link item that remembers where it came from", async () => {
    const { added, client } = setup();
    const r = await captureText(client, "  https://www.youtube.com/watch?v=abc  ");
    expect(r).toEqual({ ok: true, kind: "url" });
    expect(added).toEqual([{ kind: "url", assetId: null, url: "https://www.youtube.com/watch?v=abc", text: null, title: null, sourceUrl: "https://www.youtube.com/watch?v=abc", credit: null }]);
  });

  it("anything else becomes a note", async () => {
    const { added, client } = setup();
    expect(await captureText(client, "Warm light, low sun.\nCheck the harbour.")).toEqual({ ok: true, kind: "text" });
    expect(added[0]).toMatchObject({ kind: "text", text: "Warm light, low sun.\nCheck the harbour.", url: null });
  });

  it("a sentence containing a link is a note, not a link", async () => {
    const { added, client } = setup();
    await captureText(client, "look at https://example.com/a for the colours");
    expect(added[0].kind).toBe("text");
  });

  it("does not turn javascript:, data: or file: into a link item", async () => {
    const { added, client } = setup();
    for (const t of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd"]) await captureText(client, t);
    expect(added.map((a) => a.kind)).toEqual(["text", "text", "text"]);
  });

  it("ignores empty input", async () => {
    const { added, client } = setup();
    expect(await captureText(client, "   \n ")).toEqual({ ok: false, reason: "empty", message: "There's nothing to add yet." });
    expect(added).toHaveLength(0);
  });

  it("refuses a note over 10,000 characters and says so, instead of cutting it", async () => {
    const { added, client } = setup();
    const r = await captureText(client, "x".repeat(10_001));
    expect(r).toMatchObject({ ok: false, reason: "too-long" });
    expect((r as { message: string }).message).toMatch(/10,000/);
    expect(added).toHaveLength(0);
  });

  it("refuses a link longer than 2,048 characters", async () => {
    const { client } = setup();
    expect(await captureText(client, "https://example.com/" + "a".repeat(2100))).toMatchObject({ ok: false, reason: "too-long" });
  });
});

describe("captureFiles", () => {
  it("stores each picture as an asset, then adds an Inbox item for it", async () => {
    const { added, client, uploader } = setup();
    const r = await captureFiles(client, uploader, [file("harbour.jpg", "image/jpeg"), file("clip.mp4", "video/mp4")]);
    expect(r.added).toBe(2);
    expect(r.failed).toEqual([]);
    expect(uploader.addAssetOnly).toHaveBeenCalledTimes(2);
    expect(added.map((a) => [a.kind, a.title])).toEqual([["image", "harbour.jpg"], ["video", "clip.mp4"]]);
    expect(added[0].assetId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a gif is a picture item", async () => {
    const { added, client, uploader } = setup();
    await captureFiles(client, uploader, [file("a.gif", "image/gif")]);
    expect(added[0].kind).toBe("image");
  });

  it("passes the page the picture came from on as provenance and as the item's source", async () => {
    const { added, client, uploader } = setup();
    await captureFiles(client, uploader, [file("a.jpg", "image/jpeg")], { pageUrl: "https://example.com/post/1", now: new Date("2026-11-12T12:00:00Z") });
    expect(uploader.addAssetOnly.mock.calls[0][1]).toMatchObject({ name: "a.jpg", provenance: { sourceUrl: "https://example.com/post/1", capturedAt: "2026-11-12", credit: "", licence: "" } });
    expect(added[0].sourceUrl).toBe("https://example.com/post/1");
  });

  it("refuses SVG, other types, an image over 50 MB and a video over 200 MB, naming each file", async () => {
    const { added, client, uploader } = setup();
    const r = await captureFiles(client, uploader, [file("a.svg", "image/svg+xml"), file("a.pdf", "application/pdf"), file("big.jpg", "image/jpeg", 51 * MB), file("long.mp4", "video/mp4", 201 * MB), file("ok.jpg", "image/jpeg")]);
    expect(r.added).toBe(1);
    expect(r.failed.map((f) => f.name)).toEqual(["a.svg", "a.pdf", "big.jpg", "long.mp4"]);
    expect(r.failed[2].message).toMatch(/50 MB/);
    expect(r.failed[3].message).toMatch(/200 MB/);
    expect(added).toHaveLength(1);
    expect(uploader.addAssetOnly).toHaveBeenCalledTimes(1);
  });

  it("names a file the pipeline cannot read and carries on with the rest", async () => {
    const { added, client, uploader } = setup();
    uploader.addAssetOnly.mockRejectedValueOnce(new Error("the file is empty"));
    const r = await captureFiles(client, uploader, [file("empty.jpg", "image/jpeg"), file("ok.jpg", "image/jpeg")]);
    expect(r.failed).toEqual([{ name: "empty.jpg", message: "the file is empty" }]);
    expect(r.added).toBe(1);
    expect(added.map((a) => a.title)).toEqual(["ok.jpg"]);
  });

  it("takes at most 10 files at once", async () => {
    const { client, uploader } = setup();
    const r = await captureFiles(client, uploader, Array.from({ length: 12 }, (_, i) => file(`p${i}.jpg`, "image/jpeg")));
    expect(r.added).toBe(10);
    expect(r.failed.map((f) => f.message)).toEqual(["Only 10 files can be added at once.", "Only 10 files can be added at once."]);
  });
});

describe("ingestShare", () => {
  const share = (over: Partial<SharedPayload> = {}): SharedPayload => ({ id: "s1", receivedAt: "2026-11-12T08:00:00.000Z", title: "", text: "", url: "", files: [], skipped: 0, ...over });

  it("a shared page becomes a link item with its title, from that page", async () => {
    const { added, client, uploader } = setup();
    const r = await ingestShare(share({ title: "A fine page", url: "https://example.com/p" }), client, uploader);
    expect(r).toMatchObject({ added: 1, failed: [] });
    expect(added).toEqual([{ kind: "url", assetId: null, url: "https://example.com/p", text: null, title: "A fine page", sourceUrl: "https://example.com/p", credit: null }]);
  });

  it("shared words become a note, keeping the title", async () => {
    const { added, client, uploader } = setup();
    await ingestShare(share({ title: "Idea", text: "Use more ochre." }), client, uploader);
    expect(added[0]).toMatchObject({ kind: "text", text: "Use more ochre.", title: "Idea" });
  });

  it("shared pictures become items sourced from the page they were shared from", async () => {
    const { added, client, uploader } = setup();
    const f = file("a.jpg", "image/jpeg");
    await ingestShare(share({ url: "https://example.com/p", files: [{ name: "a.jpg", type: "image/jpeg", blob: f }] }), client, uploader);
    expect(added.map((a) => a.kind)).toEqual(["url", "image"]);
    expect(added[1].sourceUrl).toBe("https://example.com/p");
  });

  it("a share that is only a picture adds just the picture", async () => {
    const { added, client, uploader } = setup();
    await ingestShare(share({ files: [{ name: "a.jpg", type: "image/jpeg", blob: file("a.jpg", "image/jpeg") }] }), client, uploader);
    expect(added.map((a) => a.kind)).toEqual(["image"]);
  });

  it("counts the files the service worker left out", async () => {
    const { client, uploader } = setup();
    const r = await ingestShare(share({ skipped: 2, title: "x", url: "https://example.com" }), client, uploader);
    expect(r.skipped).toBe(2);
  });

  it("drops an unsafe shared link instead of adding it", async () => {
    const { added, client, uploader } = setup();
    await ingestShare(share({ url: "javascript:alert(1)", title: "x" }), client, uploader);
    expect(added.find((a) => a.kind === "url")).toBeUndefined();
  });
});
