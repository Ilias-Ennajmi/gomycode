import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelHost } from "@/components/panels/PanelHost";
import { useEditor } from "@/components/editor/EditorContext";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* none */
  }
});

function Controls() {
  const { panels, run } = useEditor();
  return (
    <>
      <button onClick={() => panels.open("layers")}>open layers</button>
      <button onClick={() => panels.toggle("inspector")}>toggle inspector</button>
      <button onClick={() => run("view.find")}>find</button>
    </>
  );
}

function mount() {
  const t = makeEditor([obj("shape", "a")]);
  t.render(
    <>
      <Controls />
      <PanelHost />
    </>,
  );
  return t;
}

const stubViewport = (desktop: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width") ? desktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe("PanelHost", () => {
  it("renders nothing until a panel is opened, then one labelled panel with a close button", () => {
    mount();
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(screen.getByText("open layers"));
    const panel = screen.getByRole("complementary", { name: "Layers" });
    expect(panel).toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Layers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Layers" })).toBeInTheDocument();
  });

  it("shows one panel at a time and toggles the open one closed", () => {
    mount();
    fireEvent.click(screen.getByText("open layers"));
    fireEvent.click(screen.getByText("toggle inspector"));
    expect(screen.queryByRole("complementary", { name: "Layers" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("toggle inspector"));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("moves focus into the panel and Escape closes it and gives focus back", () => {
    mount();
    const opener = screen.getByText("open layers");
    opener.focus();
    fireEvent.click(opener);
    const panel = screen.getByRole("complementary", { name: "Layers" });
    expect(panel.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("the close button closes and restores focus", () => {
    mount();
    const opener = screen.getByText("open layers");
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close Layers" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("opens Find and Replace from the find command and focuses its field", () => {
    mount();
    fireEvent.click(screen.getByText("find"));
    expect(screen.getByRole("complementary", { name: "Find and replace" })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Find" }));
  });

  it("resizes with the keyboard between 260 and 420 px", () => {
    mount();
    fireEvent.click(screen.getByText("open layers"));
    const sep = screen.getByRole("separator", { name: "Resize panel" });
    expect(sep).toHaveAttribute("aria-valuemin", "260");
    expect(sep).toHaveAttribute("aria-valuemax", "420");
    const panel = () => screen.getByRole("complementary", { name: "Layers" });
    expect(panel().style.width).toBe("320px");
    fireEvent.keyDown(sep, { key: "ArrowLeft" });
    expect(panel().style.width).toBe("336px");
    for (let i = 0; i < 20; i++) fireEvent.keyDown(sep, { key: "ArrowLeft" });
    expect(panel().style.width).toBe("420px");
    for (let i = 0; i < 20; i++) fireEvent.keyDown(sep, { key: "ArrowRight" });
    expect(panel().style.width).toBe("260px");
    expect(localStorage.getItem("atelier-panel-width")).toBe("260");
  });

  it("resizes by dragging the edge", () => {
    mount();
    fireEvent.click(screen.getByText("open layers"));
    const sep = screen.getByRole("separator", { name: "Resize panel" });
    sep.setPointerCapture = () => {};
    sep.releasePointerCapture = () => {};
    fireEvent.pointerDown(sep, { clientX: 700, pointerId: 1 });
    fireEvent.pointerMove(sep, { clientX: 640, pointerId: 1 });
    expect(screen.getByRole("complementary", { name: "Layers" }).style.width).toBe("380px");
    fireEvent.pointerMove(sep, { clientX: 0, pointerId: 1 });
    expect(screen.getByRole("complementary", { name: "Layers" }).style.width).toBe("420px");
    fireEvent.pointerUp(sep, { clientX: 0, pointerId: 1 });
  });

  it("becomes a bottom sheet under 768 px, without a resize handle", () => {
    stubViewport(false);
    mount();
    fireEvent.click(screen.getByText("open layers"));
    const panel = screen.getByRole("complementary", { name: "Layers" });
    expect(panel).toHaveAttribute("data-presentation", "sheet");
    expect(screen.queryByRole("separator")).toBeNull();
    expect(panel.style.width).toBe("");
  });

  it("docks on the right at 768 px and wider", () => {
    stubViewport(true);
    mount();
    fireEvent.click(screen.getByText("open layers"));
    expect(screen.getByRole("complementary", { name: "Layers" })).toHaveAttribute("data-presentation", "dock");
  });

  it("opened from the keyboard it appears without animating; opened with the pointer it eases in", () => {
    mount();
    fireEvent.pointerDown(window);
    fireEvent.click(screen.getByText("open layers"));
    expect(screen.getByRole("complementary", { name: "Layers" }).className).toMatch(/transition/);
    fireEvent.click(screen.getByRole("button", { name: "Close Layers" }));
    act(() => void fireEvent.keyDown(window, { key: "f", ctrlKey: true }));
    fireEvent.click(screen.getByText("find"));
    expect(screen.getByRole("complementary", { name: "Find and replace" }).className).not.toMatch(/transition/);
  });

  it("remembers the width on this device", () => {
    localStorage.setItem("atelier-panel-width", "380");
    mount();
    fireEvent.click(screen.getByText("open layers"));
    expect(screen.getByRole("complementary", { name: "Layers" }).style.width).toBe("380px");
  });
});
