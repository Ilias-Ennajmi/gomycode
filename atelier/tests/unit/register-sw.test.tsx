import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { RegisterSW, shouldActivateNow } from "@/components/RegisterSW";

type Listener = () => void;

/** A fake service worker container with a registration whose update can be driven by the test. */
function fakeServiceWorker(opts: { controller: boolean; waiting?: boolean }) {
  const worker = { state: "installing", postMessage: vi.fn(), listeners: new Set<Listener>(), addEventListener(_: string, l: Listener) { this.listeners.add(l); } };
  const regListeners = new Set<Listener>();
  const registration = {
    installing: null as null | typeof worker,
    waiting: opts.waiting ? { postMessage: vi.fn(), state: "installed" } : null,
    addEventListener: (_: string, l: Listener) => regListeners.add(l),
    update: vi.fn(async () => {}),
  };
  const containerListeners: string[] = [];
  const container = {
    controller: opts.controller ? {} : null,
    register: vi.fn(async () => registration),
    addEventListener: (type: string) => containerListeners.push(type),
  };
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: container });
  return {
    container,
    registration,
    worker,
    containerListeners,
    /** A new version finished installing while the old one still controls the page. */
    async finishInstalling() {
      registration.installing = worker;
      regListeners.forEach((l) => l());
      worker.state = "installed";
      worker.listeners.forEach((l) => l());
    },
  };
}

beforeEach(() => {
  pathname = "/";
});
afterEach(() => vi.unstubAllGlobals());

describe("shouldActivateNow", () => {
  it("is false while a board is open and true everywhere else", () => {
    expect(shouldActivateNow("/")).toBe(true);
    expect(shouldActivateNow("/settings")).toBe(true);
    expect(shouldActivateNow("/login")).toBe(true);
    expect(shouldActivateNow("/b/abc")).toBe(false);
    expect(shouldActivateNow("/b/")).toBe(false);
    expect(shouldActivateNow("/board")).toBe(true);
    expect(shouldActivateNow(null)).toBe(true);
  });
});

describe("RegisterSW", () => {
  it("registers /sw.js at the root, never serving the worker file from the HTTP cache", async () => {
    const sw = fakeServiceWorker({ controller: false });
    await act(async () => void render(<RegisterSW enabled />));
    expect(sw.container.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("does nothing when disabled (development) or when the browser has no service workers", async () => {
    const sw = fakeServiceWorker({ controller: false });
    await act(async () => void render(<RegisterSW enabled={false} />));
    expect(sw.container.register).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", {});
    expect(() => render(<RegisterSW enabled />)).not.toThrow();
  });

  it("renders nothing", async () => {
    fakeServiceWorker({ controller: false });
    const { container } = render(<RegisterSW enabled />);
    expect(container).toBeEmptyDOMElement();
    await act(async () => {});
  });

  it("lets an update take over straight away when no board is open", async () => {
    const sw = fakeServiceWorker({ controller: true });
    await act(async () => void render(<RegisterSW enabled />));
    await act(async () => sw.finishInstalling());
    expect(sw.worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("holds an update back while a board is open, and releases it when the person leaves the board", async () => {
    pathname = "/b/abc";
    const sw = fakeServiceWorker({ controller: true });
    const { rerender } = render(<RegisterSW enabled />);
    await act(async () => {});
    await act(async () => sw.finishInstalling());
    expect(sw.worker.postMessage).not.toHaveBeenCalled();
    pathname = "/b/other"; // another board: still held
    rerender(<RegisterSW enabled />);
    expect(sw.worker.postMessage).not.toHaveBeenCalled();
    pathname = "/";
    rerender(<RegisterSW enabled />);
    expect(sw.worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("a worker already waiting at page load is treated the same way", async () => {
    pathname = "/b/abc";
    const sw = fakeServiceWorker({ controller: true, waiting: true });
    const { rerender } = render(<RegisterSW enabled />);
    await act(async () => {});
    expect(sw.registration.waiting!.postMessage).not.toHaveBeenCalled();
    pathname = "/";
    rerender(<RegisterSW enabled />);
    expect(sw.registration.waiting!.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("the first install (no controller yet) sends nothing: it activates by itself", async () => {
    const sw = fakeServiceWorker({ controller: false });
    await act(async () => void render(<RegisterSW enabled />));
    await act(async () => sw.finishInstalling());
    expect(sw.worker.postMessage).not.toHaveBeenCalled();
  });

  it("never reloads the page when the controller changes", async () => {
    const sw = fakeServiceWorker({ controller: true });
    await act(async () => void render(<RegisterSW enabled />));
    expect(sw.containerListeners).not.toContain("controllerchange");
  });

  it("looks for updates when the app comes back to the foreground", async () => {
    const sw = fakeServiceWorker({ controller: true });
    await act(async () => void render(<RegisterSW enabled />));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(sw.registration.update).toHaveBeenCalled();
  });
});
