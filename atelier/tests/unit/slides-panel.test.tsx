import { act, createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SlidesPanel } from "@/components/present/SlidesPanel";
import { slidesOfDoc } from "@/lib/engine/present/doc-slides";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
});

const deck = () =>
  makeEditor([
    obj("frame", "a", { name: "Cover", order: "a0", notes: "Say hi" }),
    obj("frame", "b", { name: "Moodboard", order: "a1", x: 2000 }),
    obj("frame", "c", { name: "Close", order: "a2", x: 4000 }),
    obj("shape", "s", { x: 9000 }),
  ]);

const rows = () => within(screen.getByRole("list", { name: "Slide order" })).getAllByRole("listitem");
const names = () => rows().map((r) => r.getAttribute("data-slide-name"));
const ids = (t: ReturnType<typeof deck>) => slidesOfDoc(t.doc).map((s) => s.id);

describe("SlidesPanel", () => {
  it("lists the frames in presentation order, numbered", () => {
    const t = deck();
    t.render(<SlidesPanel />);
    expect(names()).toEqual(["Cover", "Moodboard", "Close"]);
    expect(within(rows()[1]).getByText("2")).toBeInTheDocument();
  });

  it("follows the order key, not the z-order", () => {
    const t = deck();
    t.doc.update("a", { order: "a9" });
    t.render(<SlidesPanel />);
    expect(names()).toEqual(["Moodboard", "Close", "Cover"]);
  });

  it("explains how to get slides when the board has no frames", () => {
    const t = makeEditor([obj("shape", "s")]);
    t.render(<SlidesPanel />);
    expect(screen.queryByRole("list", { name: "Slide order" })).toBeNull();
    expect(screen.getByText(/Add frames to build slides/)).toBeInTheDocument();
  });

  it("Move earlier / later reorders the deck in one undo step and announces it", async () => {
    const t = deck();
    t.render(<SlidesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Move Moodboard earlier" }));
    expect(ids(t)).toEqual(["b", "a", "c"]);
    await waitFor(() => expect(names()).toEqual(["Moodboard", "Cover", "Close"]));
    expect(screen.getByRole("status")).toHaveTextContent("Moodboard is now slide 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Move Cover later" }));
    expect(ids(t)).toEqual(["b", "c", "a"]);
    act(() => t.doc.undo());
    expect(ids(t)).toEqual(["b", "a", "c"]);
  });

  it("disables Move earlier on the first slide and Move later on the last", () => {
    const t = deck();
    t.render(<SlidesPanel />);
    expect(screen.getByRole("button", { name: "Move Cover earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Close later" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Cover later" })).toBeEnabled();
  });

  it("dragging a slide onto another puts it in that place", () => {
    const t = deck();
    t.render(<SlidesPanel />);
    const store: Record<string, string> = {};
    const dataTransfer = { setData: (k: string, v: string) => (store[k] = v), getData: (k: string) => store[k] ?? "", effectAllowed: "", dropEffect: "", types: ["application/x-atelier-slides"] };
    const from = rows()[2];
    const onto = rows()[0];
    fireEvent(from, Object.assign(createEvent.dragStart(from), { dataTransfer }));
    fireEvent(onto, Object.assign(createEvent.dragOver(onto), { dataTransfer }));
    fireEvent(onto, Object.assign(createEvent.drop(onto), { dataTransfer }));
    expect(ids(t)).toEqual(["c", "a", "b"]);
  });

  it("dropping something that is not a slide does nothing", () => {
    const t = deck();
    t.render(<SlidesPanel />);
    const onto = rows()[0];
    fireEvent(onto, Object.assign(createEvent.drop(onto), { dataTransfer: { getData: () => "", types: ["text/plain"] } }));
    expect(ids(t)).toEqual(["a", "b", "c"]);
  });

  it("clicking a slide's name selects the frame and brings it into view", () => {
    const t = deck();
    t.render(<SlidesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Show Moodboard on the board" }));
    expect([...t.selection.ids]).toEqual(["b"]);
    expect(t.setCamera).toHaveBeenCalled();
  });

  it("marks the slides that have presenter notes", () => {
    const t = deck();
    t.render(<SlidesPanel />);
    expect(within(rows()[0]).getByText("Has notes")).toBeInTheDocument();
    expect(within(rows()[1]).queryByText("Has notes")).toBeNull();
  });

  it("'Present' starts the presentation, and a row's button starts it at that slide", () => {
    const t = deck();
    t.render(<SlidesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Present from Moodboard" }));
    expect(screen.getByRole("region", { name: "Presentation" })).toHaveAttribute("data-slide-index", "1");
  });
});
