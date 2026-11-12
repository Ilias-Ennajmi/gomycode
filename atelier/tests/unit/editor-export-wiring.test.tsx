import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "@/components/chrome/TopBar";
import { registry } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { makeEditor, obj } from "./helpers/editor";

const base = { boardId: "b1", title: "Spring", onTitleChange: () => {}, status: "saved" as const };

describe("the editor wires the Export dialog to the board's credits", () => {
  it("the PDF deck offers a credits page", () => {
    const t = makeEditor([obj("frame", "f", { name: "One" }), obj("image", "i", { assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Sunset", provenance: { sourceUrl: "https://example.com", credit: "Jane", licence: "CC BY", capturedAt: null } })]);
    t.render(<TopBar {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const dialog = screen.getByRole("dialog", { name: "Export" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "PDF" }));
    expect(within(dialog).getByRole("checkbox", { name: "Credits page" })).toBeInTheDocument();
  });

  it("export.zip opens the dialog on ZIP for the whole board", () => {
    expect(registry.get("export.zip")).toMatchObject({ label: expect.stringMatching(/ZIP/), group: "board" });
    const openExport = vi.fn();
    expect(registry.run("export.zip", { ui: { openExport } } as never)).toBe(true);
    expect(openExport).toHaveBeenCalledWith({ format: "zip", scope: "board" });
  });
});
