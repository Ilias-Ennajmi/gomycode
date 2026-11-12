import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorChrome } from "@/components/chrome/EditorChrome";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* none */
  }
  vi.restoreAllMocks();
});

function mount(status: "saved" | "offline" = "saved") {
  const t = makeEditor([obj("shape", "a", { x: 100, y: 100 })]);
  const slot = document.createElement("div");
  slot.setAttribute("data-chrome-slot", "");
  document.body.prepend(slot);
  t.container.tabIndex = 0;
  const view = t.render(
    <EditorChrome boardId="b1" title="Spring" onTitleChange={() => {}} breadcrumb={[]} status={status} localOnly={false} slot={slot} />,
  );
  return { ...t, slot, view };
}

describe("EditorChrome", () => {
  it("puts the skip link, top bar and toolbar in the slot before the canvas", () => {
    const t = mount();
    expect(within(t.slot).getByRole("link", { name: "Skip to canvas" })).toBeInTheDocument();
    expect(within(t.slot).getByRole("textbox", { name: "Board title" })).toBeInTheDocument();
    expect(within(t.slot).getByRole("toolbar", { name: "Tools" })).toBeInTheDocument();
    // the zoom controls and the selection bar are not in the slot: they follow the canvas
    expect(within(t.slot).queryByRole("toolbar", { name: "View" })).toBeNull();
    expect(screen.getByRole("toolbar", { name: "View" })).toBeInTheDocument();
  });

  it("the skip link moves focus to the canvas", () => {
    const t = mount();
    fireEvent.click(screen.getByRole("link", { name: "Skip to canvas" }));
    expect(t.container).toHaveFocus();
    expect(t.container.id).toBe("board-canvas");
  });

  it("the selection bar appears with a selection and goes with it", () => {
    const t = mount();
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
    act(() => t.selection.set(["a"]));
    expect(screen.getByRole("toolbar", { name: "Selection" })).toBeInTheDocument();
    act(() => t.selection.clear());
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
  });

  it("the bottom-right controls step aside for an open panel", () => {
    mount();
    const dock = document.querySelector("[data-zoom-dock]") as HTMLElement;
    expect(dock.style.transform).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(dock.style.transform).toMatch(/translateX\(-\d+px\)/);
  });

  it("shows the sync status in the top bar and announces going offline", () => {
    vi.useFakeTimers();
    const t = mount("saved");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    t.view.rerender(
      t.wrap(<EditorChrome boardId="b1" title="Spring" onTitleChange={() => {}} breadcrumb={[]} status="offline" localOnly={false} slot={t.slot} />),
    );
    act(() => void vi.advanceTimersByTime(100));
    expect(screen.getByText("Offline · saved on this device")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Sync status" })).toHaveTextContent("Offline. Changes are saved on this device.");
    vi.useRealTimers();
  });
});
