import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastStore, ToastViewport, toast, toastStore } from "@/components/chrome/Toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  for (const t of toastStore.items) toastStore.dismiss(t.id);
});

describe("ToastStore", () => {
  it("expires a toast after 5 seconds by default, or after durationMs", () => {
    const s = new ToastStore();
    s.push({ message: "a" });
    s.push({ message: "b", durationMs: 1000 });
    expect(s.items.map((t) => t.message)).toEqual(["a", "b"]);
    vi.advanceTimersByTime(1000);
    expect(s.items.map((t) => t.message)).toEqual(["a"]);
    vi.advanceTimersByTime(3999);
    expect(s.items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(s.items).toHaveLength(0);
  });

  it("pauses while held (hover or focus) and keeps the time that was left", () => {
    const s = new ToastStore();
    const id = s.push({ message: "a" });
    vi.advanceTimersByTime(3000);
    s.hold(id, "hover", true);
    vi.advanceTimersByTime(60_000);
    expect(s.items).toHaveLength(1);
    s.hold(id, "focus", true);
    s.hold(id, "hover", false);
    vi.advanceTimersByTime(60_000);
    expect(s.items).toHaveLength(1); // still held by focus
    s.hold(id, "focus", false);
    vi.advanceTimersByTime(1999);
    expect(s.items).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(s.items).toHaveLength(0);
  });

  it("keeps at most three, dropping the oldest, and dismiss removes one", () => {
    const s = new ToastStore();
    const ids = ["1", "2", "3", "4"].map((m) => s.push({ message: m }));
    expect(s.items.map((t) => t.message)).toEqual(["2", "3", "4"]);
    s.dismiss(ids[2]);
    expect(s.items.map((t) => t.message)).toEqual(["2", "4"]);
    s.dismiss(12345); // unknown ids are ignored
  });

  it("notifies subscribers with a new items array each time", () => {
    const s = new ToastStore();
    const cb = vi.fn();
    s.subscribe(cb);
    const before = s.items;
    s.push({ message: "a" });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(s.items).not.toBe(before);
  });
});

describe("ToastViewport", () => {
  it("renders inside a polite status region that exists even when empty", () => {
    render(<ToastViewport />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    act(() => void toast({ message: "Deleted 3 objects" }));
    expect(region).toHaveTextContent("Deleted 3 objects");
  });

  it("runs the action and dismisses; does not take focus", () => {
    render(
      <>
        <button>before</button>
        <ToastViewport />
      </>,
    );
    screen.getByText("before").focus();
    const run = vi.fn();
    act(() => void toast({ message: "Deleted 1 object", action: { label: "Undo", run } }));
    expect(document.activeElement).toBe(screen.getByText("before"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("Deleted 1 object");
  });

  it("pauses on hover and on focus, resumes on leave", () => {
    render(<ToastViewport />);
    act(() => void toast({ message: "Hold me" }));
    const item = screen.getByText("Hold me").closest("[data-toast]") as HTMLElement;
    fireEvent.mouseEnter(item);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("status")).toHaveTextContent("Hold me");
    fireEvent.mouseLeave(item);
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByRole("status")).not.toHaveTextContent("Hold me");

    act(() => void toast({ message: "Focus me", action: { label: "Go", run: () => {} } }));
    const btn = screen.getByRole("button", { name: "Go" });
    fireEvent.focus(btn);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("status")).toHaveTextContent("Focus me");
    fireEvent.blur(btn);
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByRole("status")).not.toHaveTextContent("Focus me");
  });

  it("has a labelled dismiss button", () => {
    render(<ToastViewport />);
    act(() => void toast({ message: "x" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
