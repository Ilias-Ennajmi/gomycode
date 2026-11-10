import { describe, expect, it } from "vitest";
import { parseCollection, safeHref } from "@/lib/collection";
import { exportFileName } from "@/lib/exports";

describe("parseCollection", () => {
  it("returns null for unknown slugs (null from the function)", () => {
    expect(parseCollection(null)).toBeNull();
    expect(parseCollection({})).toBeNull();
    expect(parseCollection([])).toBeNull();
  });

  it("keeps only share-safe, well-formed fields", () => {
    const c = parseCollection({
      name: "Café launch",
      color: "teal",
      kind: "project",
      description: null,
      saves: [
        {
          title: "Hook",
          key_idea: "Show the product first.",
          takeaways: ["one", 2, "", "two", "three", "four"],
          creator: "maya",
          platform: "tiktok",
          source_url: "javascript:alert(1)",
          thumb_path: "u/a.jpg",
          applied: true,
        },
        { platform: "myspace", source_url: "https://www.instagram.com/reel/x/" },
        null,
        { platform: "web" },
      ],
    });
    expect(c?.color).toBe("teal");
    expect(c?.saves.map((s) => s.title ?? s.sourceUrl)).toEqual(["Hook", "https://www.instagram.com/reel/x/"]); // nothing-to-show rows dropped
    expect(c?.saves.every((s) => !("id" in s))).toBe(true);
    expect(c?.saves[0].takeaways).toEqual(["one", "two", "three"]);
    expect(c?.saves[0].sourceUrl).toBeNull();
    expect(c?.saves[1].platform).toBe("web");
    expect(c?.saves[1].sourceUrl).toBe("https://www.instagram.com/reel/x/");
  });

  it("falls back to violet for an unknown colour", () => {
    expect(parseCollection({ name: "x", color: "#ff0000", saves: [] })?.color).toBe("violet");
  });
});

describe("safeHref", () => {
  it("allows only http(s)", () => {
    expect(safeHref("https://a.b/c")).toBe("https://a.b/c");
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref(42)).toBeNull();
  });
});

describe("exportFileName", () => {
  it("makes a readable, safe file name", () => {
    expect(exportFileName("Café / Launch: Q4!", "brief", "pdf")).toBe("Cafe Launch Q4 brief.pdf");
    expect(exportFileName("???", "deck", "pptx")).toBe("Stash deck.pptx");
  });
});
