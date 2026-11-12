import { describe, expect, it } from "vitest";
import { nextGate } from "@/lib/viewer/gate";

describe("nextGate", () => {
  it("gone and not-found are one screen", () => {
    expect(nextGate({ status: "gone", needsPassword: false, hasSession: false })).toBe("gone");
    expect(nextGate({ status: "not-found", needsPassword: true, hasSession: true })).toBe("gone");
  });
  it("a password comes before a session", () => {
    expect(nextGate({ status: "ok", needsPassword: true, hasSession: false })).toBe("password");
    expect(nextGate({ status: "ok", needsPassword: true, hasSession: true })).toBe("password");
  });
  it("no session yet: the page asks for one by itself", () => {
    expect(nextGate({ status: "ok", needsPassword: false, hasSession: false })).toBe("session");
  });
  it("ready", () => {
    expect(nextGate({ status: "ok", needsPassword: false, hasSession: true })).toBe("ready");
  });
});
