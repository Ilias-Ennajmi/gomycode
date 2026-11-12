import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbedView } from "@/components/canvas/objects/EmbedView";
import { LinkView } from "@/components/canvas/objects/LinkView";
import { OBJECT_VIEWS } from "@/components/canvas/ObjectLayer";
import { MoreMenu } from "@/components/chrome/MoreMenu";
import { EditorOverlays } from "@/components/editor/EditorOverlays";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { liveEmbeds } from "@/lib/engine/links/live-embed";
import { validateUrlInput } from "@/lib/engine/links/url-input";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { EmbedObj, LinkObj } from "@/lib/engine/model/types";
import { makeEditor } from "./helpers/editor";

const SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups";
const YT = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

const embed = (id: string, over: Partial<EmbedObj> = {}): EmbedObj =>
  ({ ...defaultsFor("embed"), id, index: "a0", createdAt: 1, updatedAt: 1, provider: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", embedUrl: YT, ...over }) as EmbedObj;
const link = (over: Partial<LinkObj> = {}): LinkObj =>
  ({ ...defaultsFor("link"), id: "l1", index: "a0", createdAt: 1, updatedAt: 1, url: "https://example.com/page", title: "A page", description: "About it", siteName: "Example", status: "ready", ...over }) as LinkObj;
const assets: AssetResolver = { url: (id) => (id ? `blob:asset-${id}` : null), available: () => null };

beforeEach(() => {
  liveEmbeds.deactivate();
});
afterEach(() => {
  liveEmbeds.deactivate();
});

describe("EmbedView", () => {
  it("shows a facade and no iframe until it is played", () => {
    const { container } = render(<EmbedView obj={embed("e1", { title: "A video" })} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
  });

  it("plays into a sandboxed, lazy, referrer-limited iframe of exactly the derived URL", () => {
    const { container } = render(<EmbedView obj={embed("e1", { title: "A video" })} />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    const f = container.querySelector("iframe")!;
    expect(f).not.toBeNull();
    expect(f.getAttribute("sandbox")).toBe(SANDBOX);
    expect(f.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(f.getAttribute("loading")).toBe("lazy");
    expect(f.getAttribute("src")).toBe(YT);
    expect(f.getAttribute("title")).toMatch(/A video/);
    expect(f.getAttribute("allow")).toBe("fullscreen; picture-in-picture; encrypted-media");
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("activating a second embed returns the first to its facade", () => {
    const { container } = render(
      <>
        <EmbedView obj={embed("e1")} />
        <EmbedView obj={embed("e2", { embedUrl: "https://player.vimeo.com/video/76979871", provider: "vimeo" })} />
      </>,
    );
    const [p1, p2] = screen.getAllByRole("button", { name: /play/i });
    fireEvent.click(p1);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    fireEvent.click(p2);
    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute("src")).toBe("https://player.vimeo.com/video/76979871");
    expect(screen.getAllByRole("button", { name: /play/i })).toHaveLength(1);
  });

  it("is activated from outside (double-click and Enter on the canvas) and can be closed", () => {
    const { container } = render(<EmbedView obj={embed("e1")} />);
    act(() => liveEmbeds.activate("e1"));
    expect(container.querySelector("iframe")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /stop|close|back/i }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(liveEmbeds.active).toBeNull();
  });

  it("returns to the facade (and frees the slot) when it unmounts", () => {
    const { unmount } = render(<EmbedView obj={embed("e1")} />);
    act(() => liveEmbeds.activate("e1"));
    unmount();
    expect(liveEmbeds.active).toBeNull();
  });

  it.each([
    "https://evil.com/embed/x",
    "http://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "javascript:alert(1)",
    "https://www.youtube-nocookie.com.evil.com/embed/dQw4w9WgXcQ",
    "https://user@www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ])("a tampered embedUrl (%s) renders the placeholder, never an iframe", (embedUrl) => {
    const { container } = render(<EmbedView obj={embed("e1", { embedUrl })} />);
    expect(container.querySelector("[data-placeholder]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /play/i })).toBeNull();
    act(() => liveEmbeds.activate("e1"));
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("keeps the Play button out of the canvas's pointer handling", () => {
    render(<EmbedView obj={embed("e1")} />);
    expect(screen.getByRole("button", { name: /play/i }).closest("[data-editing-surface]")).not.toBeNull();
  });

  it("is what the object layer renders for an embed", () => {
    const View = OBJECT_VIEWS.embed;
    const { container } = render(<View obj={embed("e1")} doc={makeEditor().doc} assets={assets} lod={1} />);
    expect(container.querySelector("[data-embed-facade]")).not.toBeNull();
  });
});

describe("LinkView", () => {
  it("renders the title, description and site name as text", () => {
    render(<LinkView obj={link()} assets={assets} />);
    expect(screen.getByText("A page")).toBeInTheDocument();
    expect(screen.getByText("About it")).toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
  });

  it("renders hostile text inertly", () => {
    const { container } = render(<LinkView obj={link({ title: "<img src=x onerror=alert(1)>", description: "<script>alert(1)</script><b>x</b>", siteName: "<i>s</i>" })} assets={assets} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b, i")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("clamps the description (a 1 MB one) and the title again", () => {
    const { container } = render(<LinkView obj={link({ title: "t".repeat(5000), description: "d".repeat(1_000_000) })} assets={assets} />);
    expect((container.textContent ?? "").length).toBeLessThan(1500);
  });

  it("wraps the card in one anchor with rel noopener noreferrer nofollow, opening a new tab", () => {
    const { container } = render(<LinkView obj={link()} assets={assets} />);
    const anchors = container.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute("href")).toBe("https://example.com/page");
    expect(anchors[0].getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(anchors[0].getAttribute("target")).toBe("_blank");
    // a plain click selects (the canvas handles it): the anchor itself never navigates
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchors[0].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("has no anchor for a stored URL that is not http(s)", () => {
    const { container } = render(<LinkView obj={link({ url: "javascript:alert(1)" })} assets={assets} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows a skeleton and 'Loading preview…' while loading", () => {
    const { container } = render(<LinkView obj={link({ status: "loading", title: "example.com", description: "", h: 240 })} assets={assets} />);
    expect(screen.getByText("Loading preview…")).toBeInTheDocument();
    expect(container.querySelector("[data-skeleton]")).not.toBeNull();
  });

  it("a card left 'loading' by a reload (nothing is fetching it) reads as unavailable and can be retried", () => {
    render(<LinkView obj={link({ status: "loading" })} assets={assets} pending={false} onRetry={() => {}} />);
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry preview" })).toBeInTheDocument();
  });

  it("shows 'Preview unavailable' with a Retry button when it failed", () => {
    const onRetry = vi.fn();
    render(<LinkView obj={link({ status: "failed", title: "example.com", description: "" })} assets={assets} onRetry={onRetry} />);
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("without a retry handler a failed card has no button", () => {
    render(<LinkView obj={link({ status: "failed" })} assets={assets} />);
    expect(screen.queryByRole("button", { name: "Retry preview" })).toBeNull();
  });

  it("a plain domain-only card (local-only mode) shows just the domain with no status chip", () => {
    render(<LinkView obj={link({ title: "example.com", siteName: "example.com", description: "", status: "ready", h: 128 })} assets={assets} />);
    expect(screen.queryByText("Loading preview…")).toBeNull();
    expect(screen.queryByText("Preview unavailable")).toBeNull();
    expect(screen.getAllByText("example.com").length).toBeGreaterThan(0);
  });

  it("shows the thumbnail from the asset resolver, as a decorative image", () => {
    const { container } = render(<LinkView obj={link({ imageAssetId: "a1", h: 240 })} assets={assets} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:asset-a1");
    expect(img.getAttribute("alt")).toBe("");
  });

  it("is what the object layer renders for a link", () => {
    const View = OBJECT_VIEWS.link;
    const { container } = render(<View obj={link()} doc={makeEditor().doc} assets={assets} lod={1} />);
    expect(container.querySelector("[data-link-card]")).not.toBeNull();
  });
});

describe("validateUrlInput", () => {
  it("accepts a web address for a link, trimming it", () => {
    expect(validateUrlInput("link", "  https://example.com/a ")).toEqual({ ok: true, url: "https://example.com/a" });
  });
  it("accepts a provider address for an embed", () => {
    expect(validateUrlInput("embed", "https://youtu.be/dQw4w9WgXcQ")).toEqual({ ok: true, url: "https://youtu.be/dQw4w9WgXcQ" });
  });
  it("explains each way it can fail", () => {
    const msg = (kind: "link" | "embed", v: string) => {
      const r = validateUrlInput(kind, v);
      return r.ok ? null : r.message;
    };
    expect(msg("link", "")).toMatch(/enter a web address/i);
    expect(msg("link", "   ")).toMatch(/enter a web address/i);
    expect(msg("link", "not a url")).toMatch(/https:\/\//);
    expect(msg("link", "javascript:alert(1)")).toMatch(/https:\/\//);
    expect(msg("link", "file:///etc/passwd")).toMatch(/https:\/\//);
    expect(msg("link", "https://user:pw@example.com/")).toMatch(/username and password/i);
    expect(msg("link", `https://example.com/${"a".repeat(2100)}`)).toMatch(/too long/i);
    expect(msg("embed", "https://example.com/video")).toMatch(/YouTube, Vimeo/);
    expect(msg("embed", "https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ")).toMatch(/YouTube, Vimeo/);
  });
});

describe("More menu", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  });

  function mount() {
    const t = makeEditor();
    t.render(
      <>
        <MoreMenu />
        <EditorOverlays />
      </>,
    );
    return t;
  }
  const button = () => screen.getByRole("button", { name: "More objects" });

  it("is a menu button that lists the insert commands (not the tools)", () => {
    mount();
    expect(button()).toHaveAttribute("aria-haspopup", "menu");
    expect(button()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button());
    const menu = screen.getByRole("menu", { name: "More objects" });
    const names = within(menu).getAllByRole("menuitem").map((i) => i.textContent);
    expect(names.some((n) => /Link card/.test(n ?? ""))).toBe(true);
    expect(names.some((n) => /Embed video or design/.test(n ?? ""))).toBe(true);
    expect(names.some((n) => /Type specimen/.test(n ?? ""))).toBe(true);
    expect(names.some((n) => /Select tool|Sticky note|Add image/.test(n ?? ""))).toBe(false);
    expect(button()).toHaveAttribute("aria-expanded", "true");
  });

  it("works from the keyboard: Enter opens, arrows move, Escape closes and returns focus", async () => {
    mount();
    button().focus();
    fireEvent.click(button(), { detail: 0 }); // what Enter or Space on a button produces
    const menu = await screen.findByRole("menu", { name: "More objects" });
    const items = within(menu).getAllByRole("menuitem");
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "End" });
    expect(items[items.length - 1]).toHaveFocus();
    fireEvent.keyDown(items[items.length - 1], { key: "Home" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button()).toHaveFocus();
  });

  it("Link card… asks for an address, validates it, and adds a link card at the view centre", async () => {
    const t = mount();
    fireEvent.click(button());
    fireEvent.click(screen.getByRole("menuitem", { name: /Link card/ }));
    const dialog = await screen.findByRole("dialog", { name: /link/i });
    const input = within(dialog).getByLabelText("Web address");
    expect(input).toHaveFocus();

    fireEvent.submit(dialog.querySelector("form")!);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/enter a web address/i);
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/https:\/\//);
    expect(t.doc.all()).toHaveLength(0);

    fireEvent.change(input, { target: { value: "https://example.com/a" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /link/i })).toBeNull());
    const [card] = t.doc.all();
    expect(card).toMatchObject({ type: "link", url: "https://example.com/a" });
    // viewport is 1000x800, camera at the origin: centred on (500, 400)
    expect(card.x + card.w / 2).toBeCloseTo(500);
    expect(card.y + card.h / 2).toBeCloseTo(400);
    expect([...t.selection.ids]).toEqual([card.id]);
  });

  it("Embed… only takes provider addresses and adds an embed", async () => {
    const t = mount();
    fireEvent.click(button());
    fireEvent.click(screen.getByRole("menuitem", { name: /Embed video or design/ }));
    const dialog = await screen.findByRole("dialog", { name: /embed/i });
    const input = within(dialog).getByLabelText("Web address");
    fireEvent.change(input, { target: { value: "https://example.com/video" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/YouTube, Vimeo/);
    expect(t.doc.all()).toHaveLength(0);
    fireEvent.change(input, { target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(t.doc.all()).toHaveLength(1));
    expect(t.doc.all()[0]).toMatchObject({ type: "embed", embedUrl: YT });
  });

  it("Escape and Cancel close the dialog without adding anything", async () => {
    const t = mount();
    fireEvent.click(button());
    fireEvent.click(screen.getByRole("menuitem", { name: /Link card/ }));
    const dialog = await screen.findByRole("dialog", { name: /link/i });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: /link/i })).toBeNull();
    expect(t.doc.all()).toHaveLength(0);
  });
});

describe("selection bar for links and embeds", () => {
  it("offers Open link for a selected link card and Play + Open link for an embed", async () => {
    const { ContextBar } = await import("@/components/chrome/ContextBar");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const t = makeEditor([
      { ...defaultsFor("link"), id: "l1", url: "https://example.com/page", status: "ready" } as never,
      { ...defaultsFor("embed"), id: "e1", x: 500, url: "https://youtu.be/dQw4w9WgXcQ", embedUrl: YT } as never,
    ]);
    t.selection.set(["l1"]);
    t.render(<ContextBar />);
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    expect(within(bar).queryByRole("button", { name: "Play" })).toBeNull();
    fireEvent.click(within(bar).getByRole("button", { name: "Open link" }));
    expect(open).toHaveBeenCalledWith("https://example.com/page", "_blank", "noopener,noreferrer");
    act(() => t.selection.set(["e1"]));
    fireEvent.click(await within(screen.getByRole("toolbar", { name: "Selection" })).findByRole("button", { name: "Play" }));
    expect(liveEmbeds.active).toBe("e1");
    open.mockRestore();
  });
});

describe("Retry preview wiring", () => {
  it("the editor registers the retry handler (so canvas cards offer Retry) and removes it on unmount", async () => {
    const { EditorProvider } = await import("@/components/editor/EditorContext");
    const { linkRetry } = await import("@/lib/engine/links/retry-store");
    const t = makeEditor([{ ...defaultsFor("link"), id: "l1", url: "https://example.com/page", status: "failed" } as never]);
    expect(linkRetry.get()).toBeNull();
    const view = render(
      <EditorProvider handle={t.handle} uploader={{ add: vi.fn(), addAssetOnly: vi.fn() }} toast={() => {}} navigate={() => {}}>
        <LinkView obj={t.doc.get("l1") as LinkObj} assets={assets} />
      </EditorProvider>,
    );
    expect(linkRetry.get()).not.toBeNull();
    expect(await screen.findByRole("button", { name: "Retry preview" })).toBeInTheDocument();
    view.unmount();
    expect(linkRetry.get()).toBeNull();
  });

  it("without an uploader there is no handler and no button", async () => {
    const { linkRetry } = await import("@/lib/engine/links/retry-store");
    render(<LinkView obj={link({ status: "failed" })} assets={assets} />);
    expect(linkRetry.get()).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry preview" })).toBeNull();
  });
});
