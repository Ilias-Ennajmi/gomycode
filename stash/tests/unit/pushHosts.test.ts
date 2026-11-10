import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, isAllowedPushHost } from "@/lib/pushHosts";
import { parseTargets } from "@/lib/server/cron";

describe("push endpoint allowlist", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/QGv3abc",
    "https://api.push.apple.com/3/device/x",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    "https://fcm.googleapis.com:443/fcm/send/abc",
  ])("accepts %s", (u) => {
    expect(isAllowedPushEndpoint(u)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://evil.example/fcm/send",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilfcm.googleapis.com/x",
    "https://notify.windows.com/x",
    "https://push.apple.com/x",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://FCM.googleapis.com/x",
    "https://fcm.googleapis.com/a b",
    "https://fcm.googleapis.com",
    "https://fcm.googleapis.com/" + "x".repeat(1000),
    "",
    42,
    null,
  ])("refuses %s", (u) => {
    expect(isAllowedPushEndpoint(u)).toBe(false);
  });

  it("matches hosts case-insensitively but only real subdomains", () => {
    expect(isAllowedPushHost("WNS2-PAR02P.notify.windows.com")).toBe(true);
    expect(isAllowedPushHost(".notify.windows.com")).toBe(false);
    expect(isAllowedPushHost("xnotify.windows.com")).toBe(false);
  });

  it("the cron sender drops targets outside the list", () => {
    const targets = parseTargets([
      { endpoint: "https://fcm.googleapis.com/fcm/send/a", p256dh: "k", auth: "a" },
      { endpoint: "http://internal.service/hook", p256dh: "k", auth: "a" },
      { endpoint: "https://evil.example/x", p256dh: "k", auth: "a" },
      { endpoint: "https://web.push.apple.com/b", p256dh: 1, auth: "a" },
    ]);
    expect(targets.map((t) => t.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/a"]);
  });
});
