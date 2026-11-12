import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageLightbox } from "@/components/viewer/ImageLightbox";
import { ViewerApp } from "@/components/viewer/ViewerApp";
import { ViewerResolver } from "@/lib/viewer/viewer-resolver";
import type { ViewerObject } from "@/lib/viewer/viewer-types";
import { GoneError } from "@/lib/viewer/viewer-client";
import { BASE, fakeApi, makeBoard, ready } from "./helpers/viewer-ui";
import { A1, STICKY_B_TEXT } from "./helpers/viewer-fixture";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("the gone screen", () => {
  it("shows one calm message and nothing else", () => {
    render(<ViewerApp token="t" initial={{ kind: "gone" }} api={fakeApi()} />);
    expect(screen.getByRole("heading", { name: "This link isn't available" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/revoked|expired|password|404/i);
  });

  it("a 410 on the session call swaps a ready page to it", async () => {
    const { board } = await makeBoard();
    const api = fakeApi({ session: vi.fn(async () => ({ ok: false as const, reason: "gone" as const })) });
    render(<ViewerApp token="t" initial={ready(board, { hasSession: false })} api={api} />);
    expect(await screen.findByRole("heading", { name: "This link isn't available" })).toBeInTheDocument();
  });
});

describe("password gate", () => {
  const pw = { kind: "password" as const, studioName: "Studio Nord", linkKey: "abcdef123456" };

  it("has a visible label, a show/hide toggle, no autofocus and lets you paste", () => {
    render(<ViewerApp token="t" initial={pw} api={fakeApi()} />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(document.activeElement).not.toBe(input);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a wrong password is announced in a status region the field points to", async () => {
    const api = fakeApi({ unlock: vi.fn(async () => ({ ok: false as const, reason: "wrong" as const, retryAfter: 0 })) });
    render(<ViewerApp token="t" initial={pw} api={api} />);
    const input = screen.getByLabelText("Password");
    fireEvent.change(input, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Open board" }));
    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("That password isn’t right."));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(status.id);
  });

  it("a retry countdown disables the button and counts down", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = fakeApi({ unlock: vi.fn(async () => ({ ok: false as const, reason: "locked" as const, retryAfter: 3 })) });
    render(<ViewerApp token="t" initial={pw} api={api} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Open board" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Try again in 3s"));
    expect(screen.getByRole("button", { name: "Open board" })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByRole("status")).toHaveTextContent("You can try again now.");
    expect(screen.getByRole("button", { name: "Open board" })).not.toBeDisabled();
  });

  it("the right password loads the board", async () => {
    const { board } = await makeBoard();
    const api = fakeApi({ board: vi.fn(async () => board) });
    render(<ViewerApp token="t" initial={pw} api={api} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: "Open board" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Brand refresh" })).toBeInTheDocument();
    expect(api.unlock).toHaveBeenCalledWith("hunter22");
  });
});

describe("first paint", () => {
  it("the server HTML has the first slide's preview with the high-priority hint, sizes and dimensions", async () => {
    const { board, fx } = await makeBoard({ mode: "round", roundId: "00000001-0000-4000-8000-000000000000" }, { previews: true });
    const html = renderToString(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    expect(html).toContain(`${BASE}/p/tok/${fx.ids.frameA}-w480.webp`);
    expect(html).toContain(`${BASE}/p/tok/${fx.ids.frameA}-w1280.webp`);
    expect(html).toMatch(/fetchPriority="high"|fetchpriority="high"/i);
    expect(html).toMatch(/srcSet="[^"]*480w[^"]*1280w|srcset="[^"]*480w[^"]*1280w/i);
    expect(html).toMatch(/width="800"/);
    expect(html).toContain("Brand refresh");
  });
});

describe("slides", () => {
  async function open() {
    const { board, fx } = await makeBoard({}, { previews: true });
    const user = render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    return { board, fx, ...user };
  }

  it("announces the slide on every change and the arrow keys move", async () => {
    await open();
    const live = screen.getAllByRole("status").find((n) => n.className.includes("vw-sr"))!;
    expect(live).toHaveTextContent("");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(live).toHaveTextContent("Slide 2 of 2: Direction B"));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(live).toHaveTextContent("Slide 1 of 2: Direction A"));
    fireEvent.keyDown(window, { key: "End" });
    await waitFor(() => expect(live).toHaveTextContent("Slide 2 of 2"));
  });

  it("the buttons and the thumbnail strip move too, and the strip marks the current slide", async () => {
    await open();
    const strip = screen.getByRole("navigation", { name: "Slides" });
    const thumbs = within(strip).getAllByRole("button");
    expect(thumbs[0]).toHaveAttribute("aria-current", "true");
    fireEvent.click(thumbs[1]);
    expect(within(strip).getAllByRole("button")[1]).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
    expect(within(strip).getAllByRole("button")[0]).toHaveAttribute("aria-current", "true");
  });

  it("a swipe to the left shows the next slide", async () => {
    await open();
    const pane = screen.getByRole("group", { name: /Slide 1 of 2/ });
        const pe = (type: string, x: number, time: number) => {
      const e = new Event(type, { bubbles: true }) as Event & Record<string, unknown>;
      Object.assign(e, { pointerId: 1, pointerType: "touch", clientX: x, clientY: 300, button: 0 });
      Object.defineProperty(e, "timeStamp", { value: time });
      fireEvent(pane, e);
    };
    pe("pointerdown", 300, 0);
    pe("pointermove", 250, 40);
    pe("pointermove", 180, 80);
    pe("pointerup", 180, 100);
    await waitFor(() => expect(screen.getByRole("group", { name: /Slide 2 of 2/ })).toBeInTheDocument());
  });

  it("shows the changes since the last visit", async () => {
    const { board, fx } = await makeBoard({}, { previews: true });
    board.changed = { sinceRound: 1, byFrame: { [fx.ids.frameB]: { added: 2, changed: 1 } } };
    render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    expect(screen.getByText(/3 updated since your last visit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Slide 2: Direction B, 3 updated/ })).toBeInTheDocument();
  });
});

function pointer(el: Element, type: string, x: number, y: number, time: number, id = 1) {
  const e = new Event(type, { bubbles: true }) as Event & Record<string, unknown>;
  Object.assign(e, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, "timeStamp", { value: time });
  fireEvent(el, e);
}

describe("free roam", () => {
  it("the toggle swaps the slide for the whole board and back, and says which it is", async () => {
    const { board } = await makeBoard({}, { previews: true });
    const { container } = render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    expect(container.querySelector(".vw-canvas")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Free roam" }));
    expect(screen.getByRole("button", { name: "Free roam" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".vw-canvas")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Free roam" }));
    expect(container.querySelector(".vw-canvas")).toBeNull();
  });

  it("a tap on a picture opens the full-size view in a dialog and Escape closes it, returning focus", async () => {
    const { board } = await makeBoard({}, { previews: true });
    const { container } = render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    const toggle = screen.getByRole("button", { name: "Free roam" });
    fireEvent.click(toggle);
    const canvas = container.querySelector(".vw-canvas")!;
    pointer(canvas, "pointerdown", 120, 120, 0);
    pointer(canvas, "pointerup", 120, 120, 60);
    const dialog = await screen.findByRole("dialog", { name: /Brand refresh: image/ });
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("a rich text sticky", () => {
  it("draws <img onerror> as characters, not as an element", async () => {
    const { board } = await makeBoard({}, {});
    // no previews on this board: the live layer IS the slide, so the sticky is in the DOM straight away
    const { container } = render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    await waitFor(() => expect(container.querySelector('[data-object-type="sticky"]')).not.toBeNull());
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    // and the javascript: link in the same sticky was dropped by the server, so no anchor carries it
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });
});

describe("the full-size picture", () => {
  const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 533 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
  });
  afterEach(() => {
    if (offset) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offset);
    else delete (HTMLElement.prototype as { offsetWidth?: unknown }).offsetWidth;
    for (const k of ["offsetHeight", "clientWidth", "clientHeight"]) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
  });

  it("starts at a variant sized for the screen and asks for the original when zoomed in", async () => {
    // jsdom never loads pictures: a stand-in that "loads" at once lets the progressive swap (old picture stays until the new one is in) run.
    vi.stubGlobal("Image", class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_v: string) { queueMicrotask(() => this.onload?.()); } });
    const { board, fx } = await makeBoard({}, {});
    const resolver = new ViewerResolver(board);
    const imgs = board.objects.filter((o): o is Extract<ViewerObject, { type: "image" }> => o.type === "image" && o.id === fx.ids.imgA);
    render(<ImageLightbox images={imgs} index={0} onIndex={() => {}} onClose={() => {}} resolver={resolver} credits={false} allowDownload={false} title="T" />);
    const img = () => document.querySelector(".vw-lightbox img[data-variant]") as HTMLImageElement;
    await waitFor(() => expect(img()).not.toBeNull());
    const first = img().dataset.variant;
    expect(first).toBe("w1024");
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => expect(img().dataset.variant).toBe("original"));
    await waitFor(() => expect(img().src).toBe(`${BASE}/a/${A1}/original`));
    fireEvent.click(screen.getByRole("button", { name: "Fit to screen" }));
    vi.unstubAllGlobals();
  });

  it("shows no download button unless the link allows it, and then offers the original", async () => {
    const { board, fx } = await makeBoard({}, {});
    const resolver = new ViewerResolver(board);
    const imgs = board.objects.filter((o): o is Extract<ViewerObject, { type: "image" }> => o.id === fx.ids.imgA);
    const { rerender } = render(<ImageLightbox images={imgs} index={0} onIndex={() => {}} onClose={() => {}} resolver={resolver} credits={false} allowDownload={false} title="T" />);
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
    rerender(<ImageLightbox images={imgs} index={0} onIndex={() => {}} onClose={() => {}} resolver={resolver} credits={false} allowDownload={true} title="T" />);
    expect(screen.getByRole("button", { name: "Download original" })).toBeInTheDocument();
  });

  it("pictures cannot be dragged out or right-clicked as a deterrent (documented: a convenience barrier only)", async () => {
    const { board, fx } = await makeBoard({}, {});
    const resolver = new ViewerResolver(board);
    const imgs = board.objects.filter((o): o is Extract<ViewerObject, { type: "image" }> => o.id === fx.ids.imgA);
    render(<ImageLightbox images={imgs} index={0} onIndex={() => {}} onClose={() => {}} resolver={resolver} credits={false} allowDownload={false} title="T" />);
    const img = document.querySelector(".vw-lightbox img") as HTMLImageElement;
    expect(img.draggable).toBe(false);
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    img.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("credits, download, watermark and the welcome note", () => {
  it("no Download or Credits buttons when the link does not allow them", async () => {
    const { board } = await makeBoard({ allowDownload: false, showCredits: false }, { previews: true });
    render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Credits" })).toBeNull();
  });

  it("Download and Credits appear when allowed, and the dialog says downloads are a convenience", async () => {
    const { board } = await makeBoard({ allowDownload: true, showCredits: true }, { previews: true });
    render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByRole("dialog", { name: "Download" })).toHaveTextContent(/convenience/i);
    expect(screen.getByRole("button", { name: "Download this slide" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Credits" }));
    expect(screen.getByRole("button", { name: "Credits" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the watermark is aria-hidden SVG text with the studio, the visitor name and a date; names stay text", async () => {
    const { board } = await makeBoard({ watermark: true }, { previews: true });
    board.visitor.name = "<b>Evil</b>";
    const { container } = render(<ViewerApp token="t" initial={ready(board, { visitorName: "<b>Evil</b>" })} api={fakeApi()} />);
    await waitFor(() => expect(container.querySelector(".vw-watermark")).not.toBeNull());
    const wm = container.querySelector(".vw-watermark")!;
    expect(wm).toHaveAttribute("aria-hidden", "true");
    expect(wm.textContent).toContain("Studio Nord");
    expect(wm.textContent).toContain("<b>Evil</b>");
    expect(wm.querySelector("b")).toBeNull();
    expect(wm.textContent).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("the welcome note shows once per link and is plain text", async () => {
    const { board } = await makeBoard({ welcomeNote: "Hello <i>there</i>\nSecond line" }, { previews: true });
    const { unmount } = render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    const dialog = await screen.findByRole("dialog", { name: "Welcome" });
    expect(dialog).toHaveTextContent("Hello <i>there</i>");
    expect(dialog.querySelector("i")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "View the board" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    unmount();
    render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    expect(screen.queryByRole("dialog", { name: "Welcome" })).toBeNull();
  });
});

describe("offline and a dying link", () => {
  it("shows a friendly offline note and drops it when the connection returns", async () => {
    const { board } = await makeBoard({}, { previews: true });
    render(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    const line = vi.spyOn(navigator, "onLine", "get");
    act(() => {
      line.mockReturnValue(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText(/You.re offline/)).toBeInTheDocument();
    act(() => {
      line.mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(screen.queryByText(/You.re offline/)).toBeNull());
  });

  it("a visitor whose session cannot start sees a retry, not a blank page", async () => {
    const { board } = await makeBoard({}, { previews: true });
    const api = fakeApi({ session: vi.fn(async () => ({ ok: false as const, reason: "busy" as const })) });
    render(<ViewerApp token="t" initial={ready(board, { hasSession: false })} api={api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Lots of visitors/);
    expect(GoneError).toBeDefined();
  });
});

describe("the page does not leak what it should not", () => {
  it("the rendered page never contains presenter notes or another frame's private text when the board is scoped", async () => {
    const { board } = await makeBoard({}, { previews: true });
    const html = renderToString(<ViewerApp token="t" initial={ready(board)} api={fakeApi()} />);
    expect(html).not.toContain("SECRET NOTES");
    expect(typeof STICKY_B_TEXT).toBe("string");
  });
});
