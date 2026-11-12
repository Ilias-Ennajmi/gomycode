import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drainShares, type SharedPayload } from "@/lib/inbox/share-queue";

/*
 * public/sw-share.js is plain browser JavaScript (no imports), so it is run here in a sandbox with a stubbed global, like
 * public/sw.js is in service-worker.test.ts.
 */
const code = readFileSync(join(process.cwd(), "public/sw-share.js"), "utf8");

type Share = {
  id: string;
  receivedAt: string;
  title: string;
  text: string;
  url: string;
  files: { name: string; type: string; blob: Blob }[];
  skipped: number;
};
type Api = {
  parseShareForm(form: FormData): Share;
  enqueueShare(idb: IDBFactory, payload: Share): Promise<void>;
  handleShareTarget(request: Request, idb: IDBFactory): Promise<Response>;
};

const fetchStub = vi.fn(async () => {
  throw new Error("the share handler must not touch the network");
});

function load(): Api {
  const self: Record<string, unknown> = {};
  vm.runInNewContext(code, { self, crypto, Date, Promise, Response, Blob, console, URL, setTimeout, fetch: fetchStub, structuredClone });
  return self.AtelierShare as Api;
}

const MB = 1024 * 1024;
const file = (name: string, type: string, size = 10) => {
  const f = new File([new Uint8Array(Math.min(size, 64))], name, { type });
  if (size > 64) Object.defineProperty(f, "size", { value: size });
  return f;
};
const form = (fields: Record<string, string | File | Array<string | File>>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const post = (f: FormData) => new Request("https://atelier.test/share-target", { method: "POST", body: f });

let idb: IDBFactory;
let AS: Api;
beforeEach(() => {
  idb = new IDBFactory();
  AS = load();
  fetchStub.mockClear();
});

/** Everything still in the share store, oldest first, read straight from IndexedDB. */
const stored = (): Promise<SharedPayload[]> =>
  new Promise((resolve) => {
    const open = idb.open("atelier-share-inbox", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("shares", { autoIncrement: true });
    open.onsuccess = () => {
      const all = open.result.transaction("shares", "readonly").objectStore("shares").getAll();
      all.onsuccess = () => {
        open.result.close();
        resolve(all.result as SharedPayload[]);
      };
    };
  });

describe("parseShareForm", () => {
  it("reads title, text, url and files", () => {
    const s = AS.parseShareForm(form({ title: "A page", text: "Some words", url: "https://example.com/a", media: file("a.jpg", "image/jpeg") }));
    expect(s).toMatchObject({ title: "A page", text: "Some words", url: "https://example.com/a", skipped: 0 });
    expect(s.files).toHaveLength(1);
    expect(s.files[0]).toMatchObject({ name: "a.jpg", type: "image/jpeg" });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isFinite(Date.parse(s.receivedAt))).toBe(true);
  });

  it("keeps at most 10 files and counts the rest as skipped", () => {
    const files = Array.from({ length: 11 }, (_, i) => file(`p${i}.jpg`, "image/jpeg"));
    const s = AS.parseShareForm(form({ media: files }));
    expect(s.files).toHaveLength(10);
    expect(s.skipped).toBe(1);
  });

  it("drops an image over 50 MB and a video over 200 MB, keeps a 150 MB video", () => {
    const s = AS.parseShareForm(form({ media: [file("big.jpg", "image/jpeg", 51 * MB), file("ok.jpg", "image/jpeg", 50 * MB), file("long.mp4", "video/mp4", 201 * MB), file("clip.mp4", "video/mp4", 150 * MB)] }));
    expect(s.files.map((f) => f.name)).toEqual(["ok.jpg", "clip.mp4"]);
    expect(s.skipped).toBe(2);
  });

  it("drops SVG and anything that is not an allowed image or video type", () => {
    const s = AS.parseShareForm(form({ media: [file("a.svg", "image/svg+xml"), file("a.pdf", "application/pdf"), file("a.heic", "image/heic"), file("noname", ""), file("a.webp", "image/webp"), file("a.avif", "image/avif"), file("a.gif", "image/gif"), file("a.png", "image/png"), file("a.webm", "video/webm")] }));
    expect(s.files.map((f) => f.name)).toEqual(["a.webp", "a.avif", "a.gif", "a.png", "a.webm"]);
    expect(s.skipped).toBe(4);
  });

  it("promotes a link that Android put in `text` to `url`", () => {
    const s = AS.parseShareForm(form({ text: "https://example.com/a" }));
    expect(s).toMatchObject({ url: "https://example.com/a", text: "" });
  });

  it("does not promote text that is more than one link, or when a url was sent", () => {
    expect(AS.parseShareForm(form({ text: "look at https://example.com/a" }))).toMatchObject({ url: "", text: "look at https://example.com/a" });
    expect(AS.parseShareForm(form({ text: "https://example.com/a https://example.com/b" })).url).toBe("");
    expect(AS.parseShareForm(form({ text: "https://example.com/a", url: "https://example.com/real" }))).toMatchObject({ url: "https://example.com/real", text: "https://example.com/a" });
    expect(AS.parseShareForm(form({ text: "javascript:alert(1)" })).url).toBe("");
  });

  it("truncates over-long fields to 300 / 10,000 / 2,048", () => {
    const s = AS.parseShareForm(form({ title: "t".repeat(400), text: "x".repeat(20_000), url: "https://example.com/" + "a".repeat(3000) }));
    expect(s.title).toHaveLength(300);
    expect(s.text).toHaveLength(10_000);
    expect(s.url).toHaveLength(2048);
  });

  it("ignores unknown fields and string values in the files slot", () => {
    const s = AS.parseShareForm(form({ title: "t", evil: "<script>", owner_id: "x", media: "not a file" }));
    expect(Object.keys(s).sort()).toEqual(["files", "id", "receivedAt", "skipped", "text", "title", "url"]);
    expect(s.files).toEqual([]);
    expect(s.skipped).toBe(0);
  });

  it("copes with an empty form", () => {
    expect(AS.parseShareForm(new FormData())).toMatchObject({ title: "", text: "", url: "", files: [], skipped: 0 });
  });
});

describe("handleShareTarget", () => {
  it("stores the payload first, then answers 303 to /inbox?shared=1, without any network request", async () => {
    const res = await AS.handleShareTarget(post(form({ title: "Hi", url: "https://example.com/a", media: file("a.jpg", "image/jpeg", 20) })), idb);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/inbox?shared=1");
    expect(fetchStub).not.toHaveBeenCalled();
    const [p] = await stored();
    expect(p).toMatchObject({ title: "Hi", url: "https://example.com/a" });
    expect(p.files).toHaveLength(1);
    expect(p.files[0].blob.size).toBe(20);
    expect(p.files[0]).toMatchObject({ name: "a.jpg", type: "image/jpeg" });
  });

  it("keeps several shares in the order they arrived", async () => {
    await AS.handleShareTarget(post(form({ title: "first" })), idb);
    await AS.handleShareTarget(post(form({ title: "second" })), idb);
    expect((await stored()).map((p) => p.title)).toEqual(["first", "second"]);
  });

  it("answers 303 to /inbox?shared=error when storing fails, and never rejects", async () => {
    const broken = { open: () => { throw new Error("IndexedDB is blocked"); } } as unknown as IDBFactory;
    const res = await AS.handleShareTarget(post(form({ title: "Hi" })), broken);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/inbox?shared=error");
  });

  it("answers 303 to /inbox?shared=error when the body is not a form", async () => {
    const res = await AS.handleShareTarget(new Request("https://atelier.test/share-target", { method: "POST", body: "plain", headers: { "content-type": "text/plain" } }), idb);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/inbox?shared=error");
  });

  it("stores nothing for a share with nothing in it, but still sends the person to the Inbox", async () => {
    const res = await AS.handleShareTarget(post(new FormData()), idb);
    expect(res.headers.get("location")).toBe("/inbox?shared=1");
    expect(await stored()).toEqual([]);
  });

  it("stores a share whose files were all skipped, so the Inbox can say they were", async () => {
    await AS.handleShareTarget(post(form({ media: file("a.svg", "image/svg+xml") })), idb);
    const [p] = await stored();
    expect(p.files).toEqual([]);
    expect(p.skipped).toBe(1);
  });
});

describe("drainShares", () => {
  const seed = async (...titles: string[]) => {
    for (const t of titles) await AS.enqueueShare(idb, AS.parseShareForm(form({ title: t })));
  };

  it("hands over payloads in order and removes each one after its handler resolved", async () => {
    await seed("a", "b", "c");
    const seen: string[] = [];
    const n = await drainShares(idb, async (p) => void seen.push(p.title));
    expect(n).toBe(3);
    expect(seen).toEqual(["a", "b", "c"]);
    expect(await stored()).toEqual([]);
  });

  it("keeps a payload whose handler rejected, and stops there so order is kept", async () => {
    await seed("a", "b", "c");
    const seen: string[] = [];
    const n = await drainShares(idb, async (p) => {
      seen.push(p.title);
      if (p.title === "b") throw new Error("offline");
    });
    expect(n).toBe(1);
    expect(seen).toEqual(["a", "b"]);
    expect((await stored()).map((p) => p.title)).toEqual(["b", "c"]);
  });

  it("returns 0 for an empty store and when IndexedDB is unavailable", async () => {
    expect(await drainShares(idb, async () => {})).toBe(0);
    expect(await drainShares({ open: () => { throw new Error("blocked"); } } as unknown as IDBFactory, async () => {})).toBe(0);
  });
});
