import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoView } from "@/components/canvas/objects/VideoView";
import { LodContext } from "@/components/canvas/lod";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { PlaybackStore } from "@/lib/engine/media/playback-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { VideoObj } from "@/lib/engine/model/types";
import type { VariantName } from "@/lib/assets/variants";

const AID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const PID = "7a1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

function resolver(variants: VariantName[] = ["w256", "w1024"]): AssetResolver {
  return {
    url: (id, v) => `https://cdn.test/${id}/${v}`,
    available: () => ({ variants, width: 1280, height: 720 }),
  };
}
const vid = (over: Partial<VideoObj> = {}): VideoObj => ({ ...defaultsFor("video"), id: "v1", index: "a0", createdAt: 0, updatedAt: 0, assetId: AID, w: 320, h: 180, ...over }) as VideoObj;
const view = (obj: VideoObj, store: PlaybackStore, assets = resolver(), zoom = 1) =>
  render(
    <LodContext.Provider value={{ zoom, dpr: 1 }}>
      <VideoView obj={obj} assets={assets} store={store} />
    </LodContext.Provider>,
  );

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  HTMLMediaElement.prototype.play = play as never;
  HTMLMediaElement.prototype.pause = pause as never;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VideoView: poster first", () => {
  it("renders only an <img> (no <video> element) until activated, and never autoplays", () => {
    const { container } = view(vid(), new PlaybackStore());
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("[autoplay]")).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it("shows the poster still, never the video file, and names itself for assistive technology", () => {
    const { container } = view(vid(), new PlaybackStore(), resolver(["w256", "w1024"]), 1);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(`https://cdn.test/${AID}/w1024`);
    expect(img.getAttribute("src")).not.toContain("original");
    expect(img.getAttribute("alt")).toBe("");
    expect(screen.getByRole("group", { name: "Video — play" })).toBeTruthy();
  });

  it("uses the 256 px still when the card is small on screen and the larger one when it is big", () => {
    const small = view(vid(), new PlaybackStore(), resolver(), 0.3);
    expect(small.container.querySelector("img")!.getAttribute("src")).toContain("/w256");
    cleanup();
    const big = view(vid(), new PlaybackStore(), resolver(), 2);
    expect(big.container.querySelector("img")!.getAttribute("src")).toContain("/w1024");
  });

  it("shows the user's chosen poster frame instead of the asset's own", () => {
    const { container } = view(vid({ posterAssetId: PID }), new PlaybackStore());
    expect(container.querySelector("img")!.getAttribute("src")).toContain(`/${PID}/`);
  });

  it("with no poster stills at all shows a quiet placeholder, not the video file as a picture", () => {
    const { container } = view(vid(), new PlaybackStore(), resolver([]));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-poster-missing]")).not.toBeNull();
  });
});

describe("VideoView: video", () => {
  it("mounts a <video> after activation: preload metadata, muted, no autoplay attribute, no native controls", () => {
    const store = new PlaybackStore();
    const { container } = view(vid({ muted: true, loop: false }), store);
    act(() => store.activate("v1"));
    const v = container.querySelector("video")!;
    expect(v).not.toBeNull();
    expect(v.hasAttribute("autoplay")).toBe(false);
    expect(v.getAttribute("preload")).toBe("metadata");
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(false);
    expect(v.hasAttribute("controls")).toBe(false);
    expect(v.getAttribute("src")).toBe(`https://cdn.test/${AID}/original`);
    expect(v.getAttribute("poster")).toContain("/w1024");
    expect(v.getAttribute("aria-label")).toMatch(/Video/);
    expect(store.element("v1")).toBe(v);
  });

  it("plays when the store says playing and pauses when it says paused", () => {
    const store = new PlaybackStore();
    view(vid(), store);
    act(() => store.activate("v1"));
    expect(play).toHaveBeenCalled();
    act(() => store.setPlaying("v1", false));
    expect(pause).toHaveBeenCalled();
    play.mockClear();
    act(() => store.setPlaying("v1", true));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("applies muted and loop changes from the object", () => {
    const store = new PlaybackStore();
    const { container, rerender } = view(vid({ muted: true, loop: false }), store);
    act(() => store.activate("v1"));
    rerender(
      <LodContext.Provider value={{ zoom: 1, dpr: 1 }}>
        <VideoView obj={vid({ muted: false, loop: true })} assets={resolver()} store={store} />
      </LodContext.Provider>,
    );
    const v = container.querySelector("video")!;
    expect(v.muted).toBe(false);
    expect(v.loop).toBe(true);
  });

  it("goes back to the poster (no <video>) when the budget evicts it", () => {
    const store = new PlaybackStore(3);
    const { container } = view(vid(), store);
    act(() => store.activate("v1"));
    expect(container.querySelector("video")).not.toBeNull();
    act(() => {
      store.activate("b");
      store.activate("c");
      store.activate("d");
    });
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
    expect(store.element("v1")).toBeNull();
  });

  it("a clip that ends (not looping) pauses", () => {
    const store = new PlaybackStore();
    const { container } = view(vid({ loop: false }), store);
    act(() => store.activate("v1"));
    act(() => void container.querySelector("video")!.dispatchEvent(new Event("ended")));
    expect(store.state("v1")).toBe("paused");
  });

  it("a video the browser cannot play falls back to the poster and says so", () => {
    const store = new PlaybackStore();
    const { container } = view(vid(), store);
    act(() => store.activate("v1"));
    act(() => void container.querySelector("video")!.dispatchEvent(new Event("error")));
    expect(store.state("v1")).toBe("off");
    expect(screen.getByRole("status").textContent).toMatch(/can't play/i);
  });
});

describe("VideoView: lifecycle", () => {
  it("gives its playback slot back when it unmounts (culled far from the view, or deleted)", () => {
    const store = new PlaybackStore(3);
    const { unmount } = view(vid(), store);
    act(() => store.activate("v1"));
    expect(store.activeIds()).toEqual(["v1"]);
    unmount();
    expect(store.activeIds()).toEqual([]);
  });
});

describe("VideoView: GIF", () => {
  it("shows the still poster with a GIF label and a play affordance, never the animated file by default", () => {
    const { container } = view(vid({ kind: "gif", loop: true }), new PlaybackStore());
    expect(container.querySelector("img")!.getAttribute("src")).not.toContain("original");
    expect(screen.getByText("GIF")).toBeTruthy();
    expect(container.querySelector("[data-play-badge]")).not.toBeNull();
    expect(screen.getByRole("group", { name: "GIF — play" })).toBeTruthy();
  });

  it("swaps to the animated original when activated and back on eviction", () => {
    const store = new PlaybackStore(3);
    const { container } = view(vid({ kind: "gif" }), store);
    const srcs = () => [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    act(() => store.activate("v1"));
    expect(container.querySelector("video")).toBeNull();
    expect(srcs()).toContain(`https://cdn.test/${AID}/original`);
    act(() => {
      store.activate("x");
      store.activate("y");
      store.activate("z");
    });
    expect(srcs().every((u) => !u!.includes("original"))).toBe(true);
  });

  it("20 GIFs on the board never have more than 3 animated at once", () => {
    const store = new PlaybackStore(3);
    const { container } = render(
      <LodContext.Provider value={{ zoom: 1, dpr: 1 }}>
        {Array.from({ length: 20 }, (_, i) => (
          <VideoView key={i} obj={vid({ id: `g${i}`, kind: "gif" })} assets={resolver()} store={store} />
        ))}
      </LodContext.Provider>,
    );
    const animated = () => [...container.querySelectorAll("img")].filter((i) => i.getAttribute("src")!.endsWith("/original")).length;
    for (let i = 0; i < 20; i++) {
      act(() => store.activate(`g${i}`));
      expect(animated()).toBeLessThanOrEqual(3);
    }
    expect(animated()).toBe(3);
  });
});

describe("VideoView: off-screen", () => {
  type IO = { cb: IntersectionObserverCallback; el: Element | null };
  let observers: IO[];
  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        rec: IO;
        constructor(cb: IntersectionObserverCallback) {
          this.rec = { cb, el: null };
          observers.push(this.rec);
        }
        observe(el: Element) {
          this.rec.el = el;
        }
        disconnect() {}
        unobserve() {}
      },
    );
  });
  const emit = (visible: boolean) => act(() => observers.forEach((o) => o.cb([{ isIntersecting: visible, target: o.el! } as IntersectionObserverEntry], {} as IntersectionObserver)));

  it("pauses when scrolled out of view, and resumes when it comes back (still selected)", () => {
    const store = new PlaybackStore();
    store.setSelected(["v1"]);
    view(vid(), store);
    act(() => store.activate("v1"));
    play.mockClear();
    emit(false);
    expect(pause).toHaveBeenCalled();
    expect(store.state("v1")).toBe("playing"); // the wish to play is kept
    play.mockClear();
    emit(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("returns to the poster when it is both off-screen and not selected", () => {
    const store = new PlaybackStore();
    view(vid(), store);
    act(() => store.activate("v1"));
    emit(false);
    expect(store.state("v1")).toBe("off");
  });
});
