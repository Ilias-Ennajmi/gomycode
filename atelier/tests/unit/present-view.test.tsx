import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { PresentView } from "@/components/present/PresentView";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { slideCamera } from "@/lib/engine/present/slides";

const VP = { w: 1000, h: 800 };
const frame = (id: string, order: string, x: number, extra: Record<string, unknown> = {}) =>
  ({ ...defaultsFor("frame"), id, name: id.toUpperCase(), order, x, y: 0, w: 1600, h: 900, ...extra }) as NewObject;

function rig(objs: NewObject[] = [frame("a", "a0", 0, { notes: "First notes" }), frame("b", "a1", 2000, { notes: "<img src=x onerror=alert(1)>" }), frame("c", "a2", 4000)], at = 0) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const selection = new SelectionStore();
  selection.set(["a"]);
  let camera = { x: -77, y: -33, z: 0.4 };
  const setCamera = vi.fn((c: typeof camera, ...rest: [{ animate?: boolean }?]) => {
    void rest;
    camera = c;
  });
  const setReadOnly = vi.fn();
  const cancel = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const handle = {
    doc,
    selection,
    container: () => container,
    getCamera: () => camera,
    setCamera,
    viewport: () => VP,
    cancelCameraAnimation: cancel,
    setReadOnly,
    isReadOnly: () => false,
    subscribeCamera: () => () => {},
  } as unknown as CanvasHandle;
  const onExit = vi.fn();
  const utils = render(<PresentView handle={handle} startAt={at} onExit={onExit} />);
  return { doc, selection, handle, setCamera, setReadOnly, cancel, onExit, getCamera: () => camera, ...utils };
}

const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.body, { key: k, ...init });
const lastAnimate = (s: { setCamera: ReturnType<typeof vi.fn> }) => s.setCamera.mock.calls.at(-1)?.[1]?.animate;

beforeEach(() => {
  vi.spyOn(performance, "now").mockReturnValue(1000);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
});

describe("PresentView: start and exit", () => {
  it("is a read-only canvas at the first slide, with the selection cleared", () => {
    const s = rig();
    expect(s.setReadOnly).toHaveBeenCalledWith(true);
    expect(s.selection.size).toBe(0);
    expect(s.getCamera()).toEqual(slideCamera({ x: 0, y: 0, w: 1600, h: 900 }, VP));
    expect(screen.getByRole("region", { name: "Presentation" })).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("starts at the slide it is asked to", () => {
    const s = rig(undefined, 2);
    expect(s.getCamera()).toEqual(slideCamera({ x: 4000, y: 0, w: 1600, h: 900 }, VP));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("Escape exits, and unmounting restores the camera, the selection and editing", () => {
    const s = rig();
    key("Escape");
    expect(s.onExit).toHaveBeenCalledTimes(1);
    s.unmount();
    expect(s.setReadOnly).toHaveBeenLastCalledWith(false);
    expect(s.getCamera()).toEqual({ x: -77, y: -33, z: 0.4 });
    expect([...s.selection.ids]).toEqual(["a"]);
  });

  it("the Exit button exits", () => {
    const s = rig();
    fireEvent.click(screen.getByRole("button", { name: "Exit presentation" }));
    expect(s.onExit).toHaveBeenCalled();
  });

  it("with no frames it exits at once instead of showing an empty stage", () => {
    const s = rig([]);
    expect(s.onExit).toHaveBeenCalled();
  });

  it("works with a single frame: next and prev stay on it", () => {
    rig([frame("only", "a0", 0)]);
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    key("ArrowRight");
    key("ArrowLeft");
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("asks for fullscreen when the browser has it, and carries on when it does not or refuses", async () => {
    rig();
    const refusing = vi.fn().mockRejectedValue(new Error("denied"));
    document.body.innerHTML = "";
    (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen = refusing;
    rig();
    await act(async () => {});
    expect(refusing).toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Presentation" })).toBeInTheDocument();
  });
});

describe("PresentView: keyboard", () => {
  it.each([["ArrowRight"], [" "], ["PageDown"]])("%j goes to the next slide without animating", (k) => {
    const s = rig();
    key(k, { code: k === " " ? "Space" : k });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(lastAnimate(s)).toBe(false);
    expect(s.getCamera()).toEqual(slideCamera({ x: 2000, y: 0, w: 1600, h: 900 }, VP));
  });

  it.each([["ArrowLeft"], ["PageUp"]])("%s goes back", (k) => {
    const s = rig(undefined, 2);
    key(k);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(lastAnimate(s)).toBe(false);
  });

  it("Shift+Space goes back", () => {
    rig(undefined, 1);
    key(" ", { code: "Space", shiftKey: true });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("Home and End jump to the ends; digits jump to that slide; a digit past the end is ignored", () => {
    rig();
    key("End");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    key("Home");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    key("2");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    key("9");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("N toggles the notes, L the laser, U the controls", () => {
    rig();
    expect(screen.queryByRole("region", { name: "Presenter notes" })).toBeNull();
    key("n");
    expect(screen.getByRole("region", { name: "Presenter notes" })).toHaveTextContent("First notes");
    expect(screen.getByRole("button", { name: /Presenter notes/ })).toHaveAttribute("aria-pressed", "true");
    key("N");
    expect(screen.queryByRole("region", { name: "Presenter notes" })).toBeNull();

    expect(screen.getByRole("button", { name: /Laser pointer/ })).toHaveAttribute("aria-pressed", "false");
    key("l");
    expect(screen.getByRole("button", { name: /Laser pointer/ })).toHaveAttribute("aria-pressed", "true");

    const region = screen.getByRole("region", { name: "Presentation" });
    expect(region).not.toHaveAttribute("data-ui-hidden");
    key("u");
    expect(region).toHaveAttribute("data-ui-hidden", "true");
    key("u");
    expect(region).not.toHaveAttribute("data-ui-hidden");
  });

  it("shows notes as plain text, never as markup", () => {
    rig();
    key("2");
    key("n");
    const notes = screen.getByRole("region", { name: "Presenter notes" });
    expect(notes).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(notes.querySelector("img")).toBeNull();
  });

  it("says when a slide has no notes", () => {
    rig();
    key("3");
    key("n");
    expect(screen.getByRole("region", { name: "Presenter notes" })).toHaveTextContent("No notes for this slide.");
  });

  it("? opens the shortcut help; Escape closes the help first and exits only on the second press", () => {
    const s = rig();
    key("?", { shiftKey: true });
    const help = screen.getByRole("dialog", { name: "Presentation shortcuts" });
    expect(within(help).getByText("Next slide")).toBeInTheDocument();
    key("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(s.onExit).not.toHaveBeenCalled();
    key("Escape");
    expect(s.onExit).toHaveBeenCalledTimes(1);
  });

  it("owns the keyboard: editor shortcuts and Delete never reach the page", () => {
    rig();
    const spy = vi.fn();
    document.body.addEventListener("keydown", spy);
    for (const k of ["Delete", "Backspace", "v", "h", "a", "z"]) key(k);
    key("k", { ctrlKey: true });
    key("z", { metaKey: true });
    document.body.removeEventListener("keydown", spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it("Ctrl+A does not select the page text; copy and reload shortcuts are left to the browser", () => {
    rig();
    const a = new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(a);
    expect(a.defaultPrevented).toBe(true);
    const c = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(c);
    expect(c.defaultPrevented).toBe(false);
  });

  it("Space on a focused button presses that button instead of advancing", () => {
    rig();
    const prev = screen.getByRole("button", { name: "Previous slide" });
    prev.focus();
    fireEvent.keyDown(prev, { key: " ", code: "Space" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("announces 'Slide 2 of 3: B' in a polite live region", () => {
    rig();
    key("ArrowRight");
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Slide 2 of 3: B");
  });

  it("a key press interrupts a running transition", () => {
    const s = rig();
    s.cancel.mockClear();
    key("ArrowRight");
    expect(s.cancel).toHaveBeenCalled();
  });
});

describe("PresentView: pointer", () => {
  const surface = () => screen.getByTestId("present-surface");
  const swipe = (from: [number, number], to: [number, number], ms: number) => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    fireEvent.pointerDown(surface(), { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: from[0], clientY: from[1] });
    now.mockReturnValue(1000 + ms);
    fireEvent.pointerUp(surface(), { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: to[0], clientY: to[1] });
  };

  it("a swipe left goes next and a swipe right goes back, both animated", () => {
    const s = rig();
    swipe([600, 400], [500, 405], 150);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(lastAnimate(s)).toBe(true);
    swipe([400, 400], [520, 395], 150);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(lastAnimate(s)).toBe(true);
  });

  it("a short, slow, or vertical drag is not a swipe and does not change slide", () => {
    rig();
    swipe([600, 400], [580, 400], 400);
    swipe([600, 400], [500, 200], 150);
    swipe([600, 400], [500, 400], 1200);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("a tap on the right goes next, a tap on the left goes back", () => {
    const s = rig();
    Object.defineProperty(surface(), "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }) });
    swipe([800, 400], [802, 401], 80);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(lastAnimate(s)).toBe(true);
    swipe([100, 400], [100, 400], 80);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("a second finger cancels the swipe (a pinch is not a slide change)", () => {
    rig();
    fireEvent.pointerDown(surface(), { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 600, clientY: 400 });
    fireEvent.pointerDown(surface(), { pointerId: 2, pointerType: "touch", isPrimary: false, clientX: 700, clientY: 400 });
    vi.spyOn(performance, "now").mockReturnValue(1100);
    fireEvent.pointerUp(surface(), { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(surface(), { pointerId: 2, pointerType: "touch", isPrimary: false, clientX: 600, clientY: 400 });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("nothing can be selected while presenting", () => {
    const s = rig();
    fireEvent.pointerDown(surface(), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(surface(), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
    expect(s.selection.size).toBe(0);
  });

  it("free roam hands the pointer to the canvas and removes the letterbox; turning it off frames the slide again", () => {
    const s = rig();
    expect(screen.getByTestId("present-window")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Free roam/ }));
    expect(screen.queryByTestId("present-surface")).toBeNull();
    expect(screen.queryByTestId("present-window")).toBeNull();
    s.setCamera.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Free roam/ }));
    expect(screen.getByTestId("present-surface")).toBeInTheDocument();
    expect(s.setCamera).toHaveBeenCalled();
  });

  it("the arrow buttons animate; the slide strip buttons jump to that slide", () => {
    const s = rig();
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }), { detail: 1 });
    expect(lastAnimate(s)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Go to slide 3: C/ }), { detail: 1 });
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to slide 3: C/ })).toHaveAttribute("aria-current", "step");
  });

  it("a keyboard-activated button does not animate (Enter on Next)", () => {
    const s = rig();
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }), { detail: 0 });
    expect(lastAnimate(s)).toBe(false);
  });
});

describe("PresentView: the stage", () => {
  it("letterboxes the slide: a window the size of the frame on screen, in the letterbox colour", () => {
    rig();
    const w = screen.getByTestId("present-window");
    const cam = slideCamera({ x: 0, y: 0, w: 1600, h: 900 }, VP);
    expect(Number.parseFloat(w.style.width)).toBeCloseTo(1600 * cam.z, 3);
    expect(Number.parseFloat(w.style.height)).toBeCloseTo(900 * cam.z, 3);
    expect(w.style.boxShadow).toContain("var(--color-present-bg)");
  });

  it("each frame is fitted with its own aspect ratio (a tall slide gets a narrow window)", () => {
    rig([frame("tall", "a0", 0, { w: 900, h: 1600 })]);
    const w = screen.getByTestId("present-window");
    expect(Number.parseFloat(w.style.height)).toBeGreaterThan(Number.parseFloat(w.style.width));
  });

  it("hides the frame name labels and the portalled top bar and toolbar while presenting", () => {
    rig();
    const css = document.querySelector("style[data-present-style]")?.textContent ?? "";
    expect(css).toContain("[data-frame-label]");
    expect(css).toContain("[data-chrome-slot]");
  });

  it("ignores edits made to the board while presenting (the deck is a snapshot)", () => {
    const s = rig();
    s.doc.remove(["c"]);
    key("End");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("blocks paste, cut and drop from reaching the editor", () => {
    rig();
    const spy = vi.fn();
    document.body.addEventListener("paste", spy);
    document.body.addEventListener("drop", spy);
    fireEvent.paste(document.body);
    fireEvent.drop(document.body);
    document.body.removeEventListener("paste", spy);
    document.body.removeEventListener("drop", spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("PresentView: laser pointer", () => {
  function fakeCanvas() {
    const calls: { arc: unknown[][]; clear: number } = { arc: [], clear: 0 };
    const ctx = {
      setTransform() {},
      clearRect() {
        calls.clear++;
      },
      beginPath() {},
      fill() {},
      arc: (...a: unknown[]) => calls.arc.push(a),
      globalAlpha: 1,
      fillStyle: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ctx) as unknown as HTMLCanvasElement["getContext"]);
    return calls;
  }
  const flushFrames = async (n = 3) => {
    for (let i = 0; i < n; i++) await act(async () => new Promise<void>((r) => requestAnimationFrame(() => r())));
  };

  it("L shows the laser layer and L again removes it; it never touches the board", () => {
    const s = rig();
    expect(screen.queryByTestId("present-laser")).toBeNull();
    key("l");
    expect(screen.getByTestId("present-laser")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("present-surface").style.cursor).toBe("none");
    key("l");
    expect(screen.queryByTestId("present-laser")).toBeNull();
    expect(s.doc.all().length).toBe(3);
  });

  it("draws a fading trail that follows the pointer", async () => {
    const calls = fakeCanvas();
    rig();
    key("l");
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(2000);
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });
    now.mockReturnValue(2050);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 120 });
    await flushFrames();
    expect(calls.arc.length).toBeGreaterThanOrEqual(2);
    expect(calls.arc.at(-1)?.slice(0, 2)).toEqual([140, 120]);
  });

  it("under reduced motion it is a static dot with no trail", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, media: q }));
    const calls = fakeCanvas();
    rig();
    key("l");
    for (const x of [10, 20, 30]) fireEvent.pointerMove(window, { clientX: x, clientY: 10 });
    await flushFrames();
    vi.unstubAllGlobals();
    expect(calls.arc).toHaveLength(1);
    expect(calls.arc[0].slice(0, 2)).toEqual([30, 10]);
  });
});
