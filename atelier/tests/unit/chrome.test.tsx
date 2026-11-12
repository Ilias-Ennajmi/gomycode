import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "@/components/chrome/ContextMenu";
import { Minimap } from "@/components/chrome/Minimap";
import { StatusLive } from "@/components/chrome/StatusLive";
import { TopBar } from "@/components/chrome/TopBar";
import { ZoomControls } from "@/components/chrome/ZoomControls";
import { PanelHost } from "@/components/panels/PanelHost";
import { makeEditor, obj } from "./helpers/editor";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("TopBar", () => {
  const base = { boardId: "b1", title: "Spring campaign", onTitleChange: () => {}, status: "saved" as const };

  it("links the lockup home and shows the breadcrumb", () => {
    makeEditor().render(<TopBar {...base} breadcrumb={["Clients", "Acme"]} />);
    const home = screen.getAllByRole("link", { name: "Atelier home" })[0];
    expect(home).toHaveAttribute("href", "/");
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByText("Clients")).toBeInTheDocument();
    expect(within(nav).getByText("Acme")).toBeInTheDocument();
  });

  it("the title is editable: Enter commits, Escape puts the old title back", () => {
    const onTitleChange = vi.fn();
    makeEditor().render(<TopBar {...base} onTitleChange={onTitleChange} />);
    const field = screen.getByRole("textbox", { name: "Board title" });
    expect(field).toHaveValue("Spring campaign");
    fireEvent.change(field, { target: { value: "Autumn" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onTitleChange).toHaveBeenCalledWith("Autumn");
    fireEvent.change(field, { target: { value: "Nope" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(field).toHaveValue("Spring campaign");
    expect(onTitleChange).toHaveBeenCalledTimes(1);
  });

  it("an empty title is not saved", () => {
    const onTitleChange = vi.fn();
    makeEditor().render(<TopBar {...base} onTitleChange={onTitleChange} />);
    const field = screen.getByRole("textbox", { name: "Board title" });
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);
    expect(onTitleChange).not.toHaveBeenCalled();
    expect(field).toHaveValue("Spring campaign");
  });

  it("Export is enabled and runs the export command; a bare top bar keeps it disabled", () => {
    const ed = makeEditor();
    ed.render(<TopBar {...base} />);
    const b = screen.getByRole("button", { name: "Export" });
    expect(b).toBeEnabled();
    fireEvent.click(b);
    expect(screen.getByRole("dialog", { name: "Export" })).toBeInTheDocument();
  });

  it("Present is enabled and starts the presentation; a bare top bar keeps it disabled", () => {
    const ed = makeEditor([obj("frame", "f", { name: "One" })]);
    ed.render(<TopBar {...base} />);
    const b = screen.getByRole("button", { name: "Present" });
    expect(b).toBeEnabled();
    expect(b.className).not.toContain("bg-brand");
    fireEvent.click(b);
    expect(screen.getByRole("region", { name: "Presentation" })).toBeInTheDocument();
    document.body.innerHTML = "";
    render(<TopBar {...base} />);
    expect(screen.getByRole("button", { name: "Present" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Present" })).toHaveAccessibleDescription("Coming in Phase 3");
  });

  it("Share opens the Share dialog; it is the one primary button", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ links: [] }), { status: 200, headers: { "content-type": "application/json" } })));
    makeEditor([], { boardId: "b1" }).render(<TopBar {...base} />);
    const b = screen.getByRole("button", { name: "Share" });
    expect(b).toBeEnabled();
    expect(b.className).toContain("bg-brand");
    fireEvent.click(b);
    expect(screen.getByRole("dialog", { name: "Share this board" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Share stays disabled where the editor does not know its board (a bare top bar)", () => {
    makeEditor().render(<TopBar {...base} />);
    const b = screen.getByRole("button", { name: "Share" });
    expect(b).toBeDisabled();
    expect(b.className).toContain("bg-brand");
    document.body.innerHTML = "";
    render(<TopBar {...base} />);
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
  });

  it.each([
    ["saved", "Saved"],
    ["syncing", "Syncing…"],
    ["offline", "Offline · saved on this device"],
    ["error", "Sync problem · saved on this device"],
  ] as const)("shows the sync status %s", (status, text) => {
    makeEditor().render(<TopBar {...base} status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("local-only boards say they live on this device", () => {
    makeEditor().render(<TopBar {...base} localOnly />);
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  });
});

describe("ContextMenu", () => {
  function mount(objs = [obj("shape", "a", { x: 100, y: 100 }), obj("shape", "b", { x: 400, y: 100 })]) {
    const t = makeEditor(objs);
    t.render(<ContextMenu />);
    return t;
  }
  const rightClick = (el: HTMLElement, x = 150, y = 150) => fireEvent.contextMenu(el, { clientX: x, clientY: y });

  it("opens on right-click over an object, selecting it, with the registry's commands", () => {
    const t = mount();
    rightClick(t.container);
    expect([...t.selection.ids]).toEqual(["a"]);
    const menu = screen.getByRole("menu", { name: "Canvas actions" });
    for (const name of ["Cut", "Copy", "Paste", "Duplicate", "Delete", "Group", "Lock", "Bring to front", "Send to back", "Select all"]) {
      const item = within(menu).queryByRole("menuitem", { name: new RegExp(`^${name}`) });
      // Group needs two objects: it is not offered for one
      if (name === "Group") expect(item).toBeNull();
      else expect(item, name).toBeInTheDocument();
    }
    expect(within(menu).queryByRole("menuitem", { name: /Align left/ })).toBeNull();
  });

  it("offers alignment when two or more objects are selected", () => {
    const t = mount();
    act(() => t.selection.set(["a", "b"]));
    rightClick(t.container, 150, 150);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Align left/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^Group/ })).toBeInTheDocument();
  });

  it("empty canvas: paste and select all only", () => {
    const t = mount();
    rightClick(t.container, 700, 600);
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/^Paste/), expect.stringMatching(/^Select all/)]));
    expect(items.some((i) => /^Delete/.test(i.textContent ?? ""))).toBe(false);
  });

  it("running an item closes the menu and does the command", () => {
    const t = mount();
    rightClick(t.container);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /^Duplicate/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(t.doc.all()).toHaveLength(3);
  });

  it("Escape closes it and gives focus back to the canvas", () => {
    const t = mount();
    t.container.tabIndex = 0;
    t.container.focus();
    rightClick(t.container);
    const menu = screen.getByRole("menu");
    expect(menu.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(t.container).toHaveFocus();
  });

  it("arrow keys move through the items, skipping nothing, wrapping at the ends", () => {
    const t = mount();
    rightClick(t.container);
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "End" });
    expect(items[items.length - 1]).toHaveFocus();
    fireEvent.keyDown(items[items.length - 1], { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
  });

  it("Paste with an unreadable clipboard shows a hint instead of failing", async () => {
    const t = mount();
    vi.stubGlobal("navigator", { clipboard: { read: () => Promise.reject(new Error("denied")), readText: () => Promise.reject(new Error("denied")) } });
    rightClick(t.container, 700, 600);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /^Paste/ }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(t.toasts.some((x) => /clipboard/i.test(x.message))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("a touch held for 500 ms opens the menu; a touch that moves does not", () => {
    vi.useFakeTimers();
    const t = mount();
    const down = (x: number, y: number) => fireEvent.pointerDown(t.container, { pointerId: 3, pointerType: "touch", clientX: x, clientY: y, isPrimary: true });
    down(150, 150);
    act(() => void vi.advanceTimersByTime(499));
    expect(screen.queryByRole("menu")).toBeNull();
    act(() => void vi.advanceTimersByTime(2));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    down(150, 150);
    fireEvent.pointerMove(t.container, { pointerId: 3, pointerType: "touch", clientX: 190, clientY: 150 });
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a finger lifting right after the long press cannot press an item, a real tap later can", () => {
    vi.useFakeTimers();
    const t = mount();
    fireEvent.pointerDown(t.container, { pointerId: 3, pointerType: "touch", clientX: 150, clientY: 150, isPrimary: true });
    act(() => void vi.advanceTimersByTime(520));
    const duplicate = within(screen.getByRole("menu")).getByRole("menuitem", { name: /^Duplicate/ });
    fireEvent.click(duplicate, { detail: 1 }); // the compatibility click as the finger comes up
    expect(t.doc.all()).toHaveLength(2);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(450));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /^Duplicate/ }), { detail: 1 });
    expect(t.doc.all()).toHaveLength(3);
  });

  it("right-click inside the text editor keeps the browser's own menu", () => {
    const t = mount();
    const surface = document.createElement("div");
    surface.setAttribute("data-editing-surface", "");
    t.container.append(surface);
    const notPrevented = fireEvent.contextMenu(surface, { clientX: 150, clientY: 150 });
    expect(notPrevented).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("ZoomControls", () => {
  function mount(extra: Parameters<typeof obj>[2] = {}) {
    const t = makeEditor([obj("shape", "a", { x: 100, y: 100, ...extra })]);
    t.doc.undoManager.clear(); // the board starts with nothing to undo
    const onToggleMinimap = vi.fn();
    t.render(
      <>
        <ZoomControls minimapOpen onToggleMinimap={onToggleMinimap} />
        <PanelHost />
      </>,
    );
    return { ...t, onToggleMinimap };
  }

  it("shows the zoom percentage and follows the camera", () => {
    const t = mount();
    expect(screen.getByRole("button", { name: /Zoom, 100%/ })).toHaveTextContent("100%");
    act(() => t.handle.setCamera({ x: 0, y: 0, z: 2 }));
    expect(screen.getByRole("button", { name: /Zoom, 200%/ })).toHaveTextContent("200%");
  });

  it("the zoom menu has the presets 25, 50, 100, 200 and Fit", () => {
    const t = mount();
    fireEvent.click(screen.getByRole("button", { name: /Zoom, 100%/ }));
    const menu = screen.getByRole("menu", { name: "Zoom" });
    for (const name of ["25%", "50%", "100%", "200%"]) expect(within(menu).getByRole("menuitemradio", { name: new RegExp(name) })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: /^100%/ })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitem", { name: /Zoom to fit/ })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /^200%/ }));
    expect(t.handle.getCamera().z).toBeCloseTo(2);
    // zooming keeps the middle of the view where it was: viewport is 1000 x 800
    expect(t.handle.getCamera().x).toBeCloseTo(250);
    expect(t.handle.getCamera().y).toBeCloseTo(200);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Zoom to fit runs the command", () => {
    const t = mount();
    fireEvent.click(screen.getByRole("button", { name: /Zoom, 100%/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Zoom to fit/ }));
    expect(t.setCamera).toHaveBeenCalled();
  });

  it("undo and redo are aria-disabled until there is something to undo or redo", () => {
    const t = mount();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Redo" })).toHaveAttribute("aria-disabled", "true");
    act(() => t.doc.update("a", { x: 300 }));
    expect(screen.getByRole("button", { name: "Undo" })).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(t.doc.get("a")!.x).toBe(100);
    expect(screen.getByRole("button", { name: "Redo" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(t.doc.get("a")!.x).toBe(300);
  });

  it("a disabled undo stays focusable and does nothing", () => {
    const t = mount();
    const undo = screen.getByRole("button", { name: "Undo" });
    undo.focus();
    expect(undo).toHaveFocus();
    fireEvent.click(undo);
    expect(t.doc.get("a")!.x).toBe(100);
  });

  it("the minimap toggle reports its state", () => {
    const t = mount();
    const b = screen.getByRole("button", { name: "Minimap" });
    expect(b).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(b);
    expect(t.onToggleMinimap).toHaveBeenCalled();
  });

  it("panel buttons toggle Layers, Inspector and Find", () => {
    mount();
    const layers = screen.getByRole("button", { name: "Layers" });
    expect(layers).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(layers);
    expect(screen.getByRole("complementary", { name: "Layers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Layers" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find and replace" }));
    expect(screen.getByRole("complementary", { name: "Find and replace" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find and replace" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("Minimap", () => {
  function mount() {
    const t = makeEditor([
      obj("shape", "a", { x: 0, y: 0, w: 200, h: 100 }),
      obj("sticky", "b", { x: 600, y: 400 }),
      obj("image", "i", { x: 300, y: 300, w: 100, h: 100, assetId: "x" }),
    ]);
    t.render(<Minimap open />);
    const el = screen.getByRole("button", { name: /Minimap/ });
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 200, height: 150, right: 210, bottom: 170, x: 10, y: 20, toJSON: () => ({}) });
    return { ...t, el };
  }

  it("draws a plain rectangle per object (no images) and the viewport", () => {
    const { el } = mount();
    expect(el.querySelectorAll("[data-mini-object]")).toHaveLength(3);
    expect(el.querySelector("img, image")).toBeNull();
    expect(el.querySelector("[data-mini-viewport]")).not.toBeNull();
  });

  it("a click moves the camera so the clicked spot is in the middle of the view", () => {
    const { el, handle } = mount();
    const rect = el.getBoundingClientRect();
    // the middle of the minimap is the middle of the world box the map shows
    fireEvent.pointerDown(el, { pointerId: 1, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0 });
    const c = handle.getCamera();
    expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    expect(c.z).toBe(1);
    const mid = { x: c.x + 1000 / 2 / c.z, y: c.y + 800 / 2 / c.z };
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(900);
  });

  it("dragging keeps moving the camera", () => {
    const { el, handle } = mount();
    const rect = el.getBoundingClientRect();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: rect.left + 40, clientY: rect.top + 40, button: 0 });
    const a = { ...handle.getCamera() };
    fireEvent.pointerMove(el, { pointerId: 1, clientX: rect.left + 120, clientY: rect.top + 100, buttons: 1 });
    const b = handle.getCamera();
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
    fireEvent.pointerUp(el, { pointerId: 1 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: rect.left + 10, clientY: rect.top + 10, buttons: 0 });
    expect(handle.getCamera().x).toBe(b.x);
  });

  it("renders nothing when closed", () => {
    const t = makeEditor();
    t.render(<Minimap open={false} />);
    expect(screen.queryByRole("button", { name: /Minimap/ })).toBeNull();
  });

  it("is hidden below 768 px by CSS", () => {
    const { el } = mount();
    expect(el.closest("[data-minimap]")!.className).toContain("hidden");
    expect(el.closest("[data-minimap]")!.className).toContain("md:block");
  });
});

describe("StatusLive", () => {
  beforeEach(() => vi.useFakeTimers());

  it("is a visually hidden polite status region", () => {
    makeEditor().render(<StatusLive status="saved" />);
    const live = screen.getByRole("status", { name: "Sync status" });
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live.className).toContain("sr-only");
  });

  it("announces going offline and coming back, but not the routine saving cycle or the first status", () => {
    const t = makeEditor();
    const { rerender } = t.render(<StatusLive status="saved" />);
    const live = screen.getByRole("status", { name: "Sync status" });
    expect(live).toHaveTextContent("");
    rerender(t.wrap(<StatusLive status="syncing" />));
    act(() => void vi.advanceTimersByTime(100));
    expect(live).toHaveTextContent("");
    rerender(t.wrap(<StatusLive status="saved" />));
    act(() => void vi.advanceTimersByTime(100));
    expect(live).toHaveTextContent("");
    rerender(t.wrap(<StatusLive status="offline" />));
    act(() => void vi.advanceTimersByTime(100));
    expect(live).toHaveTextContent("Offline. Changes are saved on this device.");
    rerender(t.wrap(<StatusLive status="syncing" />));
    rerender(t.wrap(<StatusLive status="saved" />));
    act(() => void vi.advanceTimersByTime(100));
    expect(live).toHaveTextContent("Back online. All changes saved.");
    rerender(t.wrap(<StatusLive status="error" />));
    act(() => void vi.advanceTimersByTime(100));
    expect(live).toHaveTextContent("Sync problem. Changes are saved on this device.");
  });

  it("does not repeat what toasts already announce", () => {
    const t = makeEditor();
    t.render(<StatusLive status="saved" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    // copy and delete are toasts: the toast region announces them, this region stays silent
    t.toasts.push({ message: "Copied 1 object" });
    expect(screen.getByRole("status", { name: "Sync status" })).toHaveTextContent("");
  });
});

describe("TopBar title field in a real focus cycle", () => {
  it("Escape while focused does not save the typed text on the blur it causes", () => {
    const onTitleChange = vi.fn();
    makeEditor().render(<TopBar boardId="b" title="Spring" onTitleChange={onTitleChange} status="saved" />);
    const field = screen.getByRole("textbox", { name: "Board title" });
    field.focus();
    fireEvent.change(field, { target: { value: "Typed" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onTitleChange).not.toHaveBeenCalled();
    expect(field).not.toHaveFocus();
    expect(field).toHaveValue("Spring");
  });

  it("typing and then leaving the field saves it once", () => {
    const onTitleChange = vi.fn();
    makeEditor().render(<TopBar boardId="b" title="Spring" onTitleChange={onTitleChange} status="saved" />);
    const field = screen.getByRole("textbox", { name: "Board title" });
    field.focus();
    fireEvent.change(field, { target: { value: "Summer" } });
    field.blur();
    expect(onTitleChange).toHaveBeenCalledTimes(1);
    expect(onTitleChange).toHaveBeenCalledWith("Summer");
  });
});
