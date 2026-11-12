import { describe, expect, it, vi } from "vitest";
import { registry, type CommandCtx } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { matchShortcut } from "@/lib/engine/commands/shortcuts";

const ctx = (ui?: CommandCtx["ui"]) => ({ ui }) as unknown as CommandCtx;

describe("share.open", () => {
  it("is registered, labelled, in the board group, on Mod+Shift+S", () => {
    const c = registry.get("share.open");
    expect(c).toMatchObject({ label: "Share…", group: "board", shortcut: "Mod+Shift+S" });
  });

  it("opens the Share dialog through the UI hook, and is unavailable without it", () => {
    const openShare = vi.fn();
    expect(registry.available("share.open", ctx({ openShare }))).toBe(true);
    expect(registry.run("share.open", ctx({ openShare }))).toBe(true);
    expect(openShare).toHaveBeenCalledTimes(1);
    expect(registry.available("share.open", ctx({}))).toBe(false);
    expect(registry.run("share.open", ctx())).toBe(false);
  });

  it("no other command has its shortcut", () => {
    const users = registry.all().filter((c) => [c.shortcut, ...(c.altShortcuts ?? [])].includes("Mod+Shift+S"));
    expect(users.map((c) => c.id)).toEqual(["share.open"]);
    expect(matchShortcut({ key: "S", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }, "Mod+Shift+S")).toBe(true);
  });
});
