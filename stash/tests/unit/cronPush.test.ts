import { describe, expect, it } from "vitest";
import { sendPushes, type PushJob } from "@/lib/server/cron";

const VAPID = { publicKey: "p", privateKey: "k", subject: "mailto:x@example.invalid" };
const job = (endpoint: string): PushJob => ({ target: { endpoint, p256dh: "k", auth: "a" }, msg: { title: "t", body: "b", url: "/" } });

describe("sendPushes", () => {
  it("sends in parallel, reports gone endpoints and times out slow ones", async () => {
    const started: string[] = [];
    const send = async (j: PushJob) => {
      started.push(j.target.endpoint);
      if (j.target.endpoint.endsWith("slow")) await new Promise((r) => setTimeout(r, 200));
      if (j.target.endpoint.endsWith("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (j.target.endpoint.endsWith("boom")) throw Object.assign(new Error("500"), { statusCode: 500 });
    };
    const t0 = Date.now();
    const res = await sendPushes([job("a/ok"), job("b/slow"), job("c/gone"), job("d/boom")], VAPID, { send, timeoutMs: 30 });
    expect(Date.now() - t0).toBeLessThan(150); // the slow one didn't hold the run
    expect(started).toHaveLength(4);
    expect(res).toEqual({ sent: 1, gone: ["c/gone"], timedOut: 1 });
  });

  it("starts nothing once the deadline has passed", async () => {
    let calls = 0;
    const res = await sendPushes([job("a"), job("b")], VAPID, {
      send: async () => {
        calls++;
      },
      deadline: 1_000,
      now: () => 2_000,
    });
    expect(calls).toBe(0);
    expect(res.timedOut).toBe(2);
  });

  it("does nothing without VAPID keys", async () => {
    const res = await sendPushes([job("a")], null);
    expect(res).toEqual({ sent: 0, gone: [], timedOut: 0 });
  });
});
