import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Popover } from "@/components/chrome/Popover";
import { Tip } from "@/components/chrome/Tip";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const stubHover = (on: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("hover: hover") ? on : false, media: q, addEventListener: () => {}, removeEventListener: () => {} }));

describe("Tip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubHover(true);
  });

  const mount = () =>
    render(
      <>
        <Tip label="Undo" shortcut="Mod+Z">
          <button>one</button>
        </Tip>
        <Tip label="Redo">
          <button>two</button>
        </Tip>
      </>,
    );

  it("shows after half a second of hover, with the name and the shortcut", () => {
    mount();
    fireEvent.pointerEnter(screen.getByText("one"), { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => void vi.advanceTimersByTime(250));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Undo");
    expect(tip).toHaveTextContent(/Ctrl\+Z|⌘Z/);
  });

  it("the next tooltip right after is instant", () => {
    mount();
    fireEvent.pointerEnter(screen.getByText("one"), { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(600));
    fireEvent.pointerLeave(screen.getByText("one"), { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerEnter(screen.getByText("two"), { pointerType: "mouse" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Redo");
  });

  it("never shows for touch, and a press hides it", () => {
    mount();
    fireEvent.pointerEnter(screen.getByText("one"), { pointerType: "touch" });
    act(() => void vi.advanceTimersByTime(900));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerEnter(screen.getByText("one"), { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText("one"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not show where there is no hover (touch screens)", () => {
    stubHover(false);
    mount();
    fireEvent.pointerEnter(screen.getByText("one"), { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(900));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Escape hides it", () => {
    mount();
    fireEvent.pointerEnter(screen.getByText("one"), { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(600));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("Popover", () => {
  function Harness({ onClose = () => {} }: { onClose?: () => void }) {
    const anchor = createRef<HTMLButtonElement>();
    return (
      <>
        <button ref={anchor}>anchor</button>
        <button>elsewhere</button>
        <Popover open onClose={onClose} anchor={anchor} label="Options">
          <button>first</button>
          <button>second</button>
        </Popover>
      </>
    );
  }

  it("is portalled to the body, labelled, and takes focus", () => {
    render(<Harness />);
    const pop = screen.getByRole("dialog", { name: "Options" });
    expect(pop.parentElement).toBe(document.body);
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("a press outside closes it; a press inside or on the anchor does not", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.pointerDown(screen.getByText("second"));
    fireEvent.pointerDown(screen.getByText("anchor"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes it and focuses the anchor", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByText("first"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText("anchor")).toHaveFocus();
  });

  it("focus leaving it for another control closes it", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.blur(screen.getByText("first"), { relatedTarget: screen.getByText("elsewhere") });
    expect(onClose).toHaveBeenCalled();
    onClose.mockClear();
    fireEvent.blur(screen.getByText("first"), { relatedTarget: screen.getByText("second") });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps itself inside the window: placed from the anchor's box and clamped", () => {
    window.innerWidth = 400;
    window.innerHeight = 300;
    const rect = (left: number, top: number) => ({ left, top, width: 30, height: 30, right: left + 30, bottom: top + 30, x: left, y: top, toJSON: () => ({}) });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(380, 150) as DOMRect);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(80);
    render(<Harness />);
    const pop = screen.getByRole("dialog");
    expect(parseFloat(pop.style.left)).toBe(400 - 200 - 8);
    expect(pop.style.visibility).toBe("visible");
    spy.mockRestore();
    vi.restoreAllMocks();
  });
});

describe("Popover as a menu", () => {
  function MenuHarness({ onClose }: { onClose: () => void }) {
    const anchor = createRef<HTMLButtonElement>();
    return (
      <>
        <button ref={anchor}>anchor</button>
        <button>elsewhere</button>
        <Popover open onClose={onClose} anchor={anchor} label="Actions" role="menu">
          <button role="menuitem">item</button>
        </Popover>
      </>
    );
  }

  it("stays open when focus moves away by itself (the browser's follow-up events after a long press)", () => {
    const onClose = vi.fn();
    render(<MenuHarness onClose={onClose} />);
    fireEvent.blur(screen.getByRole("menuitem"), { relatedTarget: screen.getByText("elsewhere") });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Tab leaves the menu, like Escape", () => {
    const onClose = vi.fn();
    render(<MenuHarness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("menuitem"), { key: "Tab" });
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText("anchor")).toHaveFocus();
  });
});
