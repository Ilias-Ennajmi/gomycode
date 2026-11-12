import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextBar } from "@/components/chrome/ContextBar";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { SourceFields } from "@/components/panels/SourceFields";
import { AssetMetaStore } from "@/lib/assets/meta-store";
import type { ImageObj, Provenance, VideoObj } from "@/lib/engine/model/types";
import { useDocObject } from "@/components/canvas/useDocObject";
import { makeEditor, obj } from "./helpers/editor";

const AID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4ed1";
const prov = (o: Partial<Provenance> = {}): Provenance => ({ sourceUrl: null, credit: "", licence: "", capturedAt: null, ...o });
const img = (extra: Record<string, unknown> = {}) => obj("image", "i", { assetId: AID, w: 200, h: 100, x: 100, y: 200, ...extra });

function mount(extra: Record<string, unknown> = {}, over: { assetHas?: boolean } = {}) {
  const t = makeEditor([img(extra)]);
  const patchAsset = vi.fn().mockResolvedValue(undefined);
  const meta = new AssetMetaStore({ persist: false });
  function Live() {
    const o = useDocObject(t.doc, "i") as ImageObj;
    return <SourceFields obj={o} doc={t.doc} patchAsset={patchAsset} assetHasProvenance={() => over.assetHas ?? false} meta={meta} />;
  }
  t.render(<Live />);
  t.doc.undoManager.clear();
  return { ...t, patchAsset };
}
const cur = (t: { doc: ReturnType<typeof makeEditor>["doc"] }) => (t.doc.get("i") as ImageObj).provenance;
const commit = (name: RegExp, value: string) => {
  const input = screen.getByLabelText(name);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

afterEach(() => vi.restoreAllMocks());

describe("SourceFields", () => {
  it("shows the four fields with what the picture already says", () => {
    mount({ provenance: prov({ sourceUrl: "https://example.com/a", credit: "Jane", licence: "CC0", capturedAt: "2026-11-12" }) });
    expect((screen.getByRole("textbox", { name: /source url/i }) as HTMLInputElement).value).toBe("https://example.com/a");
    expect((screen.getByRole("textbox", { name: /^credit/i }) as HTMLInputElement).value).toBe("Jane");
    expect((screen.getByRole("combobox", { name: /licence/i }) as HTMLInputElement).value).toBe("CC0");
    expect((screen.getByLabelText(/captured/i) as HTMLInputElement).value).toBe("2026-11-12");
  });

  it("saving a credit is one undo step, writes the object and tells the asset once", () => {
    const t = mount();
    commit(/^credit/i, "Jane Doe");
    expect(cur(t)).toEqual(prov({ credit: "Jane Doe" }));
    expect(t.patchAsset).toHaveBeenCalledWith(AID, prov({ credit: "Jane Doe" }));
    t.doc.undo();
    expect(cur(t)).toBeNull();
    expect(t.doc.canUndo()).toBe(false);
  });

  it("does not PATCH an asset that already has a source", () => {
    const t = mount({}, { assetHas: true });
    commit(/^credit/i, "Jane Doe");
    expect(cur(t)?.credit).toBe("Jane Doe");
    expect(t.patchAsset).not.toHaveBeenCalled();
  });

  it("offers the usual licences as suggestions but takes any text", () => {
    const t = mount();
    const options = [...document.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(["CC BY 4.0", "CC BY-SA 4.0", "CC0", "All rights reserved", "Editorial use only"]);
    commit(/licence/i, "Studio licence #12");
    expect(cur(t)?.licence).toBe("Studio licence #12");
  });

  it("refuses a link that is not http(s), with a message, and keeps what was typed", () => {
    const t = mount();
    commit(/source url/i, "javascript:alert(1)");
    expect(screen.getByRole("alert")).toHaveTextContent(/http/i);
    expect(screen.getByRole("textbox", { name: /source url/i })).toHaveAttribute("aria-invalid", "true");
    expect((screen.getByRole("textbox", { name: /source url/i }) as HTMLInputElement).value).toBe("javascript:alert(1)");
    expect(cur(t)).toBeNull();
    commit(/source url/i, "https://user:pw@example.com/a");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(cur(t)).toBeNull();
    commit(/source url/i, "https://example.com/a");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cur(t)?.sourceUrl).toBe("https://example.com/a");
  });

  it("limits the length of credit and licence", () => {
    mount();
    const credit = screen.getByRole("textbox", { name: /^credit/i }) as HTMLInputElement;
    const licence = screen.getByRole("combobox", { name: /licence/i }) as HTMLInputElement;
    expect(credit.maxLength).toBe(200);
    expect(licence.maxLength).toBe(100);
  });

  it("sets and clears the capture date", () => {
    const t = mount({ provenance: prov({ credit: "x" }) });
    fireEvent.change(screen.getByLabelText(/captured/i), { target: { value: "2026-05-01" } });
    expect(cur(t)?.capturedAt).toBe("2026-05-01");
    fireEvent.change(screen.getByLabelText(/captured/i), { target: { value: "" } });
    expect(cur(t)?.capturedAt).toBeNull();
  });

  it("clearing everything removes the provenance", () => {
    const t = mount({ provenance: prov({ credit: "Jane" }) });
    commit(/^credit/i, "");
    expect(cur(t)).toBeNull();
  });

  it("shows a valid source as a link that opens safely, and hostile text only as text", () => {
    mount({ provenance: prov({ sourceUrl: "https://example.com/a?b=1" }) });
    const a = screen.getByRole("link", { name: /open source/i });
    expect(a).toHaveAttribute("href", "https://example.com/a?b=1");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a.getAttribute("rel")).toMatch(/noopener/);
    expect(a.getAttribute("rel")).toMatch(/noreferrer/);
  });

  it("renders a stored hostile credit as a field value, never as markup", () => {
    mount({ provenance: prov({ credit: '"><img src=x onerror=alert(1)>' }) });
    expect(document.querySelector("img[onerror]")).toBeNull();
    expect((screen.getByRole("textbox", { name: /^credit/i }) as HTMLInputElement).value).toBe('"><img src=x onerror=alert(1)>');
  });

  it("is read-only when disabled", () => {
    const t = makeEditor([img()]);
    t.render(<SourceFields obj={t.doc.get("i") as ImageObj} doc={t.doc} disabled />);
    expect(screen.getByRole("textbox", { name: /^credit/i })).toBeDisabled();
  });
});

describe("Inspector Source section", () => {
  it("appears for one selected picture and one selected video, not for other objects", () => {
    const t = makeEditor([img(), obj("video", "v", { assetId: AID, x: 500, y: 200 }), obj("sticky", "s", { x: 900, y: 200 })]);
    t.render(<InspectorPanel />);
    act(() => t.selection.set(["i"]));
    expect(screen.getByRole("region", { name: "Source" })).toBeInTheDocument();
    act(() => t.selection.set(["v"]));
    expect(screen.getByRole("region", { name: "Source" })).toBeInTheDocument();
    commit(/^credit/i, "Film Co");
    expect((t.doc.get("v") as VideoObj).provenance?.credit).toBe("Film Co");
    act(() => t.selection.set(["s"]));
    expect(screen.queryByRole("region", { name: "Source" })).toBeNull();
    act(() => t.selection.set(["i", "v"]));
    expect(screen.queryByRole("region", { name: "Source" })).toBeNull();
  });
});

describe("selection bar Source popover", () => {
  it("opens the same fields from the bar for a picture", () => {
    const t = makeEditor([img()]);
    t.render(<ContextBar />);
    act(() => t.selection.set(["i"]));
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    fireEvent.click(within(bar).getByRole("button", { name: /source/i }));
    const dialog = screen.getByRole("dialog", { name: /source/i });
    const input = within(dialog).getByRole("textbox", { name: /^credit/i });
    fireEvent.change(input, { target: { value: "Jane" } });
    fireEvent.blur(input);
    expect((t.doc.get("i") as ImageObj).provenance?.credit).toBe("Jane");
  });
});
