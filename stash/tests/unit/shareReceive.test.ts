import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/share/receive/route";
import { fitWithin } from "@/lib/shareInbox";
import { publicUrl } from "@/lib/links";

function post(form: FormData) {
  return POST(new Request("https://stash.example/share/receive", { method: "POST", body: form }));
}

describe("POST /share/receive (fallback before the service worker)", () => {
  it("redirects a shared link to the save sheet with its fields", async () => {
    const form = new FormData();
    form.set("title", "Reel");
    form.set("text", "look https://www.instagram.com/reel/abc/");
    const r = await post(form);
    expect(r.status).toBe(303);
    const loc = new URL(r.headers.get("location")!, "https://stash.example");
    expect(loc.pathname).toBe("/share");
    expect(loc.searchParams.get("text")).toContain("instagram.com/reel/abc");
    expect(loc.searchParams.get("title")).toBe("Reel");
  });

  it("hands a shared image to the phone without storing it on the server", async () => {
    const form = new FormData();
    form.set("text", "from the gallery");
    form.set("media", new File([new Uint8Array([0xff, 0xd8, 0xff, 0x01])], "shot.jpg", { type: "image/jpeg" }));
    const r = await post(form);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    const html = await r.text();
    expect(html).toContain('caches.open("stash-share-inbox")');
    expect(html).toContain("/share?text=from+the+gallery&shared-image=");
    expect(html).toContain(Buffer.from([0xff, 0xd8, 0xff, 0x01]).toString("base64"));
  });

  it("can't be used to inject markup through the shared text", async () => {
    const form = new FormData();
    form.set("text", "</script><script>alert(1)</script>");
    form.set("media", new File([new Uint8Array([1])], "x.png", { type: "image/png" }));
    const html = await (await post(form)).text();
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it("ignores non-image files and survives an empty body", async () => {
    const form = new FormData();
    form.set("media", new File(["hi"], "a.txt", { type: "text/plain" }));
    expect((await post(form)).status).toBe(303);
    const r = await POST(new Request("https://stash.example/share/receive", { method: "POST", body: "nope" }));
    expect(r.headers.get("location")).toBe("/share");
  });

  it("GET just opens the save sheet", () => {
    const r = GET(new Request("https://stash.example/share/receive?url=https%3A%2F%2Fx.y"));
    expect(r.headers.get("location")).toBe("/share?url=https%3A%2F%2Fx.y");
  });
});

describe("screenshot helpers", () => {
  it("fits the long side and keeps the aspect ratio", () => {
    expect(fitWithin(1080, 2400, 1600)).toEqual({ width: 720, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(3000, 1000, 1024)).toEqual({ width: 1024, height: 341 });
  });

  it("only real links are shared or opened", () => {
    expect(publicUrl("https://www.tiktok.com/@a/video/1")).toBe("https://www.tiktok.com/@a/video/1");
    expect(publicUrl("screenshot:0f8fad5b-d9cb-469f-a165-70867728950e.jpg")).toBeUndefined();
  });
});
