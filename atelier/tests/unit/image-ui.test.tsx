import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageView } from "@/components/canvas/objects/ImageView";
import { LodContext } from "@/components/canvas/lod";
import { ContextBar } from "@/components/chrome/ContextBar";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { ImageObj, NewObject } from "@/lib/engine/model/types";
import { makeEditor, obj } from "./helpers/editor";

const assets: AssetResolver = { url: () => "blob:x", available: () => ({ variants: [], width: 4000, height: 3000 }) };
const imgObj = (extra: Partial<ImageObj> = {}) => ({ ...defaultsFor("image"), id: "i", assetId: "a", w: 200, h: 100, ...extra }) as unknown as ImageObj;
const mountView = (o: ImageObj, doc?: BoardDoc) =>
  render(
    <LodContext.Provider value={{ zoom: 1, dpr: 1 }}>
      <ImageView obj={o} assets={assets} doc={doc} />
    </LodContext.Provider>,
  );

describe("ImageView", () => {
  it("applies the mask, grayscale and flip from the pure style functions", () => {
    const { container } = mountView(imgObj({ mask: { kind: "rounded", radius: 12 }, grayscale: true, flipX: true }));
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.borderRadius).toContain("12px");
    const img = container.querySelector("img")!;
    expect(img.style.filter).toBe("grayscale(1)");
    expect(img.style.transform).toBe("scale(-1, 1)");
  });
  it("follows the board-wide value check live", () => {
    const doc = new BoardDoc();
    const { container } = mountView(imgObj(), doc);
    expect(container.querySelector("img")!.style.filter).toBe("");
    act(() => {
      doc.meta.valueCheck = true;
    });
    expect(container.querySelector("img")!.style.filter).toBe("grayscale(1)");
    act(() => {
      doc.meta.valueCheck = false;
    });
    expect(container.querySelector("img")!.style.filter).toBe("");
  });
});

describe("Image controls in the context bar", () => {
  const image = (extra: Record<string, unknown> = {}) => obj("image", "i", { assetId: "a", x: 100, y: 100, w: 200, h: 150, ...extra }) as NewObject;
  it("an image selection shows crop, aspect, mask, grayscale, flip and replace", () => {
    const t = makeEditor([image()]);
    t.selection.set(["i"]);
    t.render(<ContextBar />);
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    for (const name of ["Crop", "Crop aspect", /^Mask/, "Grayscale", "Flip horizontally", "Flip vertically", "Replace image"]) {
      expect(within(bar).getByRole("button", { name })).toBeTruthy();
    }
  });
  it("two images hide crop and replace but keep the rest", () => {
    const t = makeEditor([image(), obj("image", "j", { assetId: "a", x: 400, y: 100 }) as NewObject]);
    t.selection.set(["i", "j"]);
    t.render(<ContextBar />);
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    expect(within(bar).queryByRole("button", { name: "Crop" })).toBeNull();
    expect(within(bar).queryByRole("button", { name: "Replace image" })).toBeNull();
    expect(within(bar).getByRole("button", { name: "Grayscale" })).toBeTruthy();
  });
  it("Grayscale button toggles the image and reports pressed", () => {
    const t = makeEditor([image()]);
    t.selection.set(["i"]);
    t.render(<ContextBar />);
    const btn = screen.getByRole("button", { name: "Grayscale" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect((t.doc.get("i") as ImageObj).grayscale).toBe(true);
    expect(screen.getByRole("button", { name: "Grayscale" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("the Crop button enters the crop tool", () => {
    const t = makeEditor([image()]);
    t.selection.set(["i"]);
    t.render(<ContextBar />);
    fireEvent.click(screen.getByRole("button", { name: "Crop" }));
    expect(t.setTool).toHaveBeenCalledWith("crop");
  });
  it("while cropping the bar offers Apply and Cancel instead of Crop", () => {
    const t = makeEditor([image()]);
    t.selection.set(["i"]);
    t.render(<ContextBar />);
    act(() => t.tools.setTool("crop"));
    expect(screen.queryByRole("button", { name: "Crop" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel crop" }));
    expect(t.setTool).toHaveBeenLastCalledWith("select");
  });
  it("the Mask popover sets a circle mask and a rounded radius", () => {
    const t = makeEditor([image()]);
    t.selection.set(["i"]);
    t.render(<ContextBar />);
    fireEvent.click(screen.getByRole("button", { name: /^Mask/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Rounded mask" }));
    expect((t.doc.get("i") as ImageObj).mask.kind).toBe("rounded");
    expect((t.doc.get("i") as ImageObj).mask.radius).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("radio", { name: "Circle mask" }));
    expect((t.doc.get("i") as ImageObj).mask.kind).toBe("circle");
  });
});

describe("Inspector image section", () => {
  it("shows the crop window as percentages and edits it", () => {
    const t = makeEditor([obj("image", "i", { assetId: "a", x: 100, y: 100, w: 200, h: 150 }) as NewObject]);
    t.selection.set(["i"]);
    t.render(<InspectorPanel />);
    const w = screen.getByRole("textbox", { name: "Crop W" }) as HTMLInputElement;
    expect(w.value).toBe("100");
    fireEvent.focus(w);
    fireEvent.change(w, { target: { value: "50" } });
    fireEvent.keyDown(w, { key: "Enter" });
    const o = t.doc.get("i") as ImageObj;
    expect(o.crop?.w).toBeCloseTo(0.5);
    expect(o.w).toBe(200);
    expect(o.h).toBeCloseTo(300); // half the width of the same picture: twice as tall for the same box width
  });
});
