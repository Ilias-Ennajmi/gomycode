import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/test/seed-share/route";
import { loadSharePage } from "@/lib/server/share-page";

const post = (body: unknown) => POST(new Request("http://localhost/api/test/seed-share", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
afterEach(() => vi.unstubAllEnvs());

describe("the e2e seed route", () => {
  it("does not exist outside local-only mode", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "");
    expect((await post({ op: "create", spec: { frames: [{ name: "A" }] } })).status).toBe(404);
  });

  it("does not exist in production even when local-only is (wrongly) on", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await post({ op: "create", spec: { frames: [{ name: "A" }] } })).status).toBe(404);
  });

  it("in local-only mode it makes a link the real share page opens, then revokes it", async () => {
    vi.stubEnv("ATELIER_LOCAL_ONLY", "1");
    vi.stubEnv("SHARE_COOKIE_SECRET", "x".repeat(40));
    const res = await post({ op: "create", spec: { title: "Seeded", frames: [{ name: "A", images: 2, sticky: "hello" }, { name: "B", images: 1 }] } });
    expect(res.status).toBe(201);
    const made = (await res.json()) as { token: string; linkId: string; frames: Record<string, string> };
    const page = await loadSharePage(new Request("http://x/"), made.token, { assetBase: "https://a.test" });
    expect(page.kind).toBe("ready");
    if (page.kind === "ready") {
      expect(page.board.slides.map((s) => s.name)).toEqual(["A", "B"]);
      expect(page.board.slides[0].previewW480).toBe(`https://a.test/p/seed/${made.frames.A}-w480.webp`);
      expect(page.board.objects.filter((o) => o.type === "image")).toHaveLength(3);
    }
    expect((await post({ op: "revoke", linkId: made.linkId })).status).toBe(204);
    expect(await loadSharePage(new Request("http://x/"), made.token, { assetBase: "https://a.test" })).toEqual({ kind: "gone" });
  });
});
