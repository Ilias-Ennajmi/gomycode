import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/share-target/route";

describe("/share-target without the service worker", () => {
  it("answers a POST with a 303 to /inbox and never reads the body", async () => {
    const formData = vi.fn();
    const request = { method: "POST", url: "https://atelier.test/share-target", formData, text: vi.fn(), json: vi.fn(), arrayBuffer: vi.fn(), body: {} } as unknown as Request;
    const res = (POST as unknown as (r: Request) => Response)(request);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/inbox");
    for (const read of [formData, (request as unknown as { text: () => void }).text, (request as unknown as { json: () => void }).json, (request as unknown as { arrayBuffer: () => void }).arrayBuffer]) {
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("answers a GET with the same redirect", () => {
    const res = GET();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/inbox");
  });

  it("is never cached", () => {
    expect(GET().headers.get("cache-control")).toMatch(/no-store/);
  });
});
