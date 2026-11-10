import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { filterSaves } from "@/lib/queue";
import type { SaveItem } from "@/lib/data";

const xml = readFileSync(new URL("../../android/app/src/main/res/xml/shortcuts.xml", import.meta.url), "utf8");
const gradle = readFileSync(new URL("../../android/app/build.gradle", import.meta.url), "utf8");

describe("long-press shortcuts", () => {
  it("the Android shell and the web manifest open the same three views", () => {
    const host = /def siteHost = "([^"]+)"/.exec(gradle)![1];
    const android = [...xml.matchAll(/android:data="([^"]+)"/g)].map((m) => m[1]);
    const web = (manifest().shortcuts ?? []).map((s) => `https://${host}${s.url}`);
    expect(android).toEqual(web);
    expect(web.map((u) => new URL(u).pathname + new URL(u).search)).toEqual([
      "/play?queue=today",
      "/library?search=1",
      "/library?space=inbox",
    ]);
  });

  it("the share target is the same POST form on both sides", () => {
    const st = manifest().share_target!;
    expect(st).toMatchObject({ action: "/share/receive", method: "POST", enctype: "multipart/form-data" });
    expect(gradle).toContain('/share/receive\\\\\\"');
    expect(gradle).toContain("multipart/form-data");
    expect(gradle).toContain('\\\\\\"name\\\\\\": \\\\\\"media\\\\\\"');
  });

  it("?space=inbox shows unfiled saves even before the Spaces have loaded", () => {
    const base = { archivedAt: null, watchedAt: null, kept: false, appliedAt: null, platform: "instagram" } as unknown as SaveItem;
    const saves = [
      { ...base, id: "a", spaceId: null },
      { ...base, id: "b", spaceId: "inbox-id" },
      { ...base, id: "c", spaceId: "marketing" },
    ] as SaveItem[];
    expect(filterSaves(saves, { space: "inbox", filter: "all", inboxId: null }).map((s) => s.id)).toEqual(["a"]);
    expect(filterSaves(saves, { space: "inbox", filter: "all", inboxId: "inbox-id" }).map((s) => s.id)).toEqual(["a", "b"]);
  });
});
