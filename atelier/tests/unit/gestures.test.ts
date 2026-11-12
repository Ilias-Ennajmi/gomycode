import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { MAX_ZOOM, MIN_ZOOM, panBy, zoomAt, type Camera } from "@/lib/engine/geometry/camera";
import {
  PointerTracker,
  applyWheelAction,
  cameraKeyAction,
  classifyWheel,
  dragThreshold,
  zoomFitCamera,
  zoom100Camera,
  zoomSelectionCamera,
  zoomStepCamera,
} from "@/lib/engine/input/gestures";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { DEFAULT_NAV_SETTINGS, loadSettings, sanitizeSettings, saveSettings, type NavSettings } from "@/lib/settings";

const S: NavSettings = { ...DEFAULT_NAV_SETTINGS };
const wheel = (over: Partial<Parameters<typeof classifyWheel>[0]> = {}) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  ...over,
});

describe("classifyWheel", () => {
  it("ctrl (trackpad pinch) and meta wheel zoom, scrolling up zooms in", () => {
    const pinchIn = classifyWheel(wheel({ ctrlKey: true, deltaY: -4 }), S);
    const pinchOut = classifyWheel(wheel({ ctrlKey: true, deltaY: 4 }), S);
    const cmd = classifyWheel(wheel({ metaKey: true, deltaY: -100 }), S);
    expect(pinchIn.kind).toBe("zoom");
    expect(pinchIn.kind === "zoom" && pinchIn.factor).toBeGreaterThan(1);
    expect(pinchOut.kind === "zoom" && pinchOut.factor).toBeLessThan(1);
    expect(cmd.kind === "zoom" && cmd.factor).toBeGreaterThan(1);
  });

  it("a mouse line wheel zooms by default (line mode, or a whole-number notch of 100)", () => {
    expect(classifyWheel(wheel({ deltaMode: 1, deltaY: 3 }), S).kind).toBe("zoom");
    expect(classifyWheel(wheel({ deltaY: 100 }), S).kind).toBe("zoom");
    expect(classifyWheel(wheel({ deltaY: -120 }), S).kind).toBe("zoom");
  });

  it("trackpad pixel deltas pan: small, fractional, or with a horizontal component", () => {
    for (const e of [wheel({ deltaY: 7 }), wheel({ deltaY: 12.5 }), wheel({ deltaX: 30, deltaY: 100 }), wheel({ deltaY: 33.3 })]) {
      expect(classifyWheel(e, S).kind).toBe("pan");
    }
  });

  it("pan delta is the screen-space movement of the content (pass it to panBy)", () => {
    const a = classifyWheel(wheel({ deltaX: 10, deltaY: 20.5 }), S);
    expect(a).toEqual({ kind: "pan", dx: -10, dy: -20.5 });
    const cam = applyWheelAction({ x: 0, y: 0, z: 2 }, a, { x: 0, y: 0 });
    expect(cam.y).toBeCloseTo(10.25); // scrolling down moves the view down the canvas
  });

  it("an unlocked mouse wheel follows the wheel setting; a trackpad always pans", () => {
    const pan: NavSettings = { ...S, wheel: "pan" };
    expect(classifyWheel(wheel({ deltaMode: 1, deltaY: 3 }), pan).kind).toBe("pan");
    expect(classifyWheel(wheel({ deltaY: 7 }), { ...S, wheel: "zoom" }).kind).toBe("pan");
  });

  it("locked + wheel pan always pans (even a notchy mouse wheel); locked + zoom always zooms", () => {
    const lockedPan: NavSettings = { ...S, wheel: "pan", locked: true };
    const lockedZoom: NavSettings = { ...S, wheel: "zoom", locked: true };
    for (const e of [wheel({ deltaMode: 1, deltaY: 3 }), wheel({ deltaY: 100 }), wheel({ deltaY: 7 })]) {
      expect(classifyWheel(e, lockedPan).kind).toBe("pan");
      expect(classifyWheel(e, lockedZoom).kind).toBe("zoom");
    }
    // pinch still zooms: it is a different gesture, not the wheel behaviour the lock is about
    expect(classifyWheel(wheel({ ctrlKey: true, deltaY: 3 }), lockedPan).kind).toBe("zoom");
  });

  it("sensitivity scales the zoom step", () => {
    const f = (s: number) => {
      const a = classifyWheel(wheel({ deltaMode: 1, deltaY: -1 }), { ...S, sensitivity: s });
      return a.kind === "zoom" ? a.factor : NaN;
    };
    expect(f(2)).toBeGreaterThan(f(1));
    expect(f(0.5)).toBeLessThan(f(1));
    expect(f(1)).toBeGreaterThan(1);
  });
});

describe("extreme wheel input never breaks the camera (Review Focus 5)", () => {
  const HOME: Camera = { x: 0, y: 0, z: 1 };
  const finite = (c: Camera) => [c.x, c.y, c.z].every(Number.isFinite);

  it("deltas of 10^4, 10^9, NaN and Infinity in every mode keep zoom in range and everything finite", () => {
    const values = [1e4, -1e4, 1e9, -1e9, NaN, Infinity, -Infinity, 0, 1e-12];
    for (const deltaMode of [0, 1, 2]) {
      for (const ctrlKey of [false, true]) {
        for (const settings of [S, { ...S, wheel: "pan" as const, locked: true }, { ...S, sensitivity: 2 }]) {
          let cam = HOME;
          for (const deltaY of values) {
            for (const deltaX of [0, 1e4, NaN]) {
              const a = classifyWheel(wheel({ deltaX, deltaY, deltaMode, ctrlKey }), settings);
              if (a.kind === "zoom") expect(Number.isFinite(a.factor) && a.factor > 0).toBe(true);
              else expect(Number.isFinite(a.dx) && Number.isFinite(a.dy)).toBe(true);
              cam = applyWheelAction(cam, a, { x: 400, y: 300 });
              expect(finite(cam)).toBe(true);
              expect(cam.z).toBeGreaterThanOrEqual(MIN_ZOOM);
              expect(cam.z).toBeLessThanOrEqual(MAX_ZOOM);
            }
          }
        }
      }
    }
  });

  it("a thousand 10^4 wheel events zoom to the limit and stop there", () => {
    let cam = HOME;
    for (let i = 0; i < 1000; i++) cam = applyWheelAction(cam, classifyWheel(wheel({ deltaMode: 1, deltaY: -1e4 }), S), { x: 10, y: 10 });
    expect(cam.z).toBe(MAX_ZOOM);
    for (let i = 0; i < 1000; i++) cam = applyWheelAction(cam, classifyWheel(wheel({ deltaMode: 1, deltaY: 1e4 }), S), { x: 10, y: 10 });
    expect(cam.z).toBe(MIN_ZOOM);
    expect(finite(cam)).toBe(true);
  });

  it("zooming at 10^7 coordinates stays finite and keeps the point under the cursor", () => {
    const far: Camera = { x: 1e7, y: -1e7, z: 1 };
    const cam = applyWheelAction(far, { kind: "zoom", factor: 1.5 }, { x: 500, y: 300 });
    expect(finite(cam)).toBe(true);
    const before = { x: 500 / far.z + far.x, y: 300 / far.z + far.y };
    const after = { x: 500 / cam.z + cam.x, y: 300 / cam.z + cam.y };
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
  });

  it("zoom to fit on an empty board is a finite camera showing the origin", () => {
    const empty = new BoardDoc();
    const cam = zoomFitCamera(empty, { w: 1000, h: 800 });
    expect(finite(cam)).toBe(true);
    expect(cam.z).toBe(1);
    expect(zoomFitCamera(empty, { w: 0, h: 0 })).toEqual(expect.objectContaining({ z: 1 }));
    expect(finite(zoomFitCamera(empty, { w: NaN, h: -5 }))).toBe(true);
  });
});

function touch(id: number, x: number, y: number) {
  return { pointerId: id, pointerType: "touch", x, y };
}
function mouse(id: number, x: number, y: number) {
  return { pointerId: id, pointerType: "mouse", x, y };
}

describe("PointerTracker", () => {
  it("one pointer is the primary; hover moves of unknown pointers are reported as hover", () => {
    const t = new PointerTracker();
    expect(t.move(mouse(1, 5, 5))).toBe("hover");
    expect(t.down(mouse(1, 0, 0))).toBe("primary");
    expect(t.move(mouse(1, 10, 10))).toBe("primary");
    expect(t.up(mouse(1, 10, 10))).toBe("primary");
    expect(t.pinch).toBeNull();
  });

  it("two touches pinch: scale is the per-move distance ratio, centre and drift follow the fingers", () => {
    const t = new PointerTracker();
    expect(t.down(touch(1, 100, 100))).toBe("primary");
    expect(t.down(touch(2, 200, 100))).toBe("pinch");
    expect(t.pinch).toEqual({ center: { x: 150, y: 100 }, scale: 1, dx: 0, dy: 0 });
    expect(t.move(touch(2, 300, 100))).toBe("pinch");
    expect(t.pinch!.scale).toBeCloseTo(2); // 100 -> 200
    expect(t.pinch!.center).toEqual({ x: 200, y: 100 });
    expect(t.pinch!.dx).toBeCloseTo(50);
    expect(t.move(touch(1, 200, 100))).toBe("pinch");
    expect(t.pinch!.scale).toBeCloseTo(0.5); // fingers now at 200 and 300: distance 200 -> 100
  });

  it("scale from two moving touches compounds to the total ratio", () => {
    const t = new PointerTracker();
    t.down(touch(1, 0, 0));
    t.down(touch(2, 100, 0));
    let total = 1;
    for (let i = 1; i <= 10; i++) {
      t.move(touch(2, 100 + i * 10, 0)); // 110, 120 ... 200
      total *= t.pinch!.scale;
    }
    expect(total).toBeCloseTo(2, 6);
  });

  it("a third touch is ignored and does not disturb the pinch", () => {
    const t = new PointerTracker();
    t.down(touch(1, 0, 0));
    t.down(touch(2, 100, 0));
    expect(t.down(touch(3, 50, 50))).toBe("ignored");
    expect(t.move(touch(3, 500, 500))).toBe("ignored");
    expect(t.up(touch(3, 500, 500))).toBe("ignored");
    expect(t.move(touch(2, 150, 0))).toBe("pinch");
    expect(t.pinch!.scale).toBeCloseTo(1.5);
  });

  it("extra pointers are ignored once a single-pointer drag has started", () => {
    const t = new PointerTracker();
    t.down(touch(1, 0, 0));
    t.move(touch(1, 40, 0)); // past the 6 px touch threshold: dragging
    expect(t.down(touch(2, 100, 100))).toBe("ignored");
    expect(t.move(touch(2, 120, 120))).toBe("ignored");
    expect(t.move(touch(1, 80, 0))).toBe("primary");
    expect(t.pinch).toBeNull();
  });

  it("a second finger before the drag threshold turns the pointing into a pinch", () => {
    const t = new PointerTracker();
    t.down(touch(1, 0, 0));
    t.move(touch(1, 2, 0)); // under 6 px
    expect(t.down(touch(2, 100, 0))).toBe("pinch");
  });

  it("a mouse never pinches with a touch", () => {
    const t = new PointerTracker();
    t.down(mouse(1, 0, 0));
    expect(t.down(touch(2, 10, 10))).toBe("ignored");
  });

  it("after a pinch the remaining finger does nothing until every finger is lifted", () => {
    const t = new PointerTracker();
    t.down(touch(1, 0, 0));
    t.down(touch(2, 100, 0));
    expect(t.up(touch(1, 0, 0))).toBe("pinch-end");
    expect(t.pinch).toBeNull();
    expect(t.move(touch(2, 300, 300))).toBe("ignored");
    expect(t.up(touch(2, 300, 300))).toBe("ignored");
    expect(t.down(touch(4, 0, 0))).toBe("primary"); // clean slate
  });

  it("drag threshold: 3 px for mouse and pen, 6 px for touch", () => {
    expect(dragThreshold("mouse")).toBe(3);
    expect(dragThreshold("pen")).toBe(3);
    expect(dragThreshold("touch")).toBe(6);
    const probe = (type: string, distance: number) => {
      const t = new PointerTracker();
      t.down({ pointerId: 1, pointerType: type, x: 0, y: 0 });
      t.move({ pointerId: 1, pointerType: type, x: distance, y: 0 });
      return t.dragging;
    };
    expect(probe("mouse", 2.9)).toBe(false);
    expect(probe("mouse", 3)).toBe(true);
    expect(probe("pen", 3)).toBe(true);
    expect(probe("touch", 5.9)).toBe(false);
    expect(probe("touch", 6)).toBe(true);
  });

  it("two touches at the same point (zero distance) never produce NaN or Infinity", () => {
    const t = new PointerTracker();
    t.down(touch(1, 50, 50));
    t.down(touch(2, 50, 50));
    let cam: Camera = { x: 1e7, y: 1e7, z: 1 };
    for (const [id, x, y] of [[2, 50, 50], [2, 50, 50.0000001], [1, 50, 50], [2, 51, 50], [1, 1e9, 1e9], [2, 1e9, 1e9]] as const) {
      expect(t.move(touch(id, x, y))).toBe("pinch");
      const p = t.pinch!;
      expect([p.scale, p.dx, p.dy, p.center.x, p.center.y].every(Number.isFinite)).toBe(true);
      expect(p.scale).toBeGreaterThanOrEqual(0.5);
      expect(p.scale).toBeLessThanOrEqual(2);
      cam = panBy(zoomAt(cam, p.center, p.scale), p.dx, p.dy);
      expect([cam.x, cam.y, cam.z].every(Number.isFinite)).toBe(true);
      expect(cam.z).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(cam.z).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });

  it("pinching a finger to the same spot repeatedly cannot drive the zoom out of range", () => {
    const t = new PointerTracker();
    t.down(touch(1, 0, 0));
    t.down(touch(2, 100, 0));
    let cam: Camera = { x: 0, y: 0, z: 1 };
    for (let i = 0; i < 200; i++) {
      t.move(touch(2, 0, 0));
      cam = zoomAt(cam, t.pinch!.center, t.pinch!.scale);
      t.move(touch(2, 5000, 0));
      cam = zoomAt(cam, t.pinch!.center, t.pinch!.scale);
    }
    expect(Number.isFinite(cam.z)).toBe(true);
    expect(cam.z).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(cam.z).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it("non-finite pointer coordinates are ignored", () => {
    const t = new PointerTracker();
    t.down(touch(1, 0, 0));
    t.down(touch(2, 100, 0));
    expect(t.move(touch(2, NaN, 0))).toBe("ignored");
    expect(t.pinch!.scale).toBe(1);
  });
});

describe("keyboard camera shortcuts", () => {
  const key = (over: Record<string, unknown>) => ({ key: "", code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over });
  it("Shift+1 fits, Shift+2 zooms to selection (layout independent via code)", () => {
    expect(cameraKeyAction(key({ key: "!", code: "Digit1", shiftKey: true }))).toBe("fit");
    expect(cameraKeyAction(key({ key: "@", code: "Digit2", shiftKey: true }))).toBe("selection");
    expect(cameraKeyAction(key({ key: "1", code: "Digit1" }))).toBeNull();
  });
  it("Ctrl/Cmd + - 0 zoom in, out and to 100 %", () => {
    expect(cameraKeyAction(key({ key: "=", code: "Equal", ctrlKey: true }))).toBe("zoomIn");
    expect(cameraKeyAction(key({ key: "+", code: "Equal", metaKey: true, shiftKey: true }))).toBe("zoomIn");
    expect(cameraKeyAction(key({ key: "-", code: "Minus", ctrlKey: true }))).toBe("zoomOut");
    expect(cameraKeyAction(key({ key: "0", code: "Digit0", metaKey: true }))).toBe("zoom100");
    expect(cameraKeyAction(key({ key: "0", code: "Digit0" }))).toBeNull();
    expect(cameraKeyAction(key({ key: "-", code: "Minus", ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe("camera helpers", () => {
  const vp = { w: 1000, h: 800 };
  const box = (id: string, x: number, y: number, w: number, h: number): NewObject => ({ ...defaultsFor("shape"), id, x, y, w, h }) as NewObject;

  it("zoomFitCamera shows every object with padding, never above 100 %", () => {
    const doc = new BoardDoc();
    doc.createMany([box("a", 0, 0, 100, 100), box("b", 4000, 3000, 100, 100)]);
    const cam = zoomFitCamera(doc, vp);
    expect(cam.z).toBeLessThan(0.25);
    expect(cam.x).toBeLessThan(0);
    const one = new BoardDoc();
    one.create(box("a", 0, 0, 100, 100));
    expect(zoomFitCamera(one, vp).z).toBe(1);
  });

  it("zoomSelectionCamera frames just the selected objects", () => {
    const doc = new BoardDoc();
    doc.createMany([box("a", 0, 0, 100, 100), box("b", 4000, 3000, 400, 300)]);
    const cam = zoomSelectionCamera(doc, new Set(["b"]), vp);
    expect(cam!.x).toBeGreaterThan(3000);
    expect(zoomSelectionCamera(doc, new Set(), vp)).toBeNull();
    expect(zoomSelectionCamera(doc, new Set(["nope"]), vp)).toBeNull();
  });

  it("step and 100 % zoom keep the viewport centre fixed", () => {
    const c: Camera = { x: 100, y: 50, z: 0.5 };
    const centre = (k: Camera) => ({ x: k.x + vp.w / 2 / k.z, y: k.y + vp.h / 2 / k.z });
    const up = zoomStepCamera(c, vp, 1);
    expect(up.z).toBeGreaterThan(0.5);
    expect(centre(up).x).toBeCloseTo(centre(c).x, 6);
    const down = zoomStepCamera(c, vp, -1);
    expect(down.z).toBeLessThan(0.5);
    const one = zoom100Camera(c, vp);
    expect(one.z).toBe(1);
    expect(centre(one).y).toBeCloseTo(centre(c).y, 6);
  });
});

describe("nav settings", () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeStorage(initial: Record<string, string> = {}) {
    const m = new Map(Object.entries(initial));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  }

  it("defaults: mouse wheel zooms, sensitivity 1, snap on, not locked, pen draws and finger also draws", () => {
    expect(DEFAULT_NAV_SETTINGS).toEqual({ wheel: "zoom", sensitivity: 1, locked: false, snap: true, penOnlyDraws: false });
  });

  it("round-trips through localStorage", () => {
    const st = fakeStorage();
    vi.stubGlobal("localStorage", st);
    const s: NavSettings = { wheel: "pan", sensitivity: 1.5, locked: true, snap: false, penOnlyDraws: true };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });

  it("falls back to defaults when storage is missing, throws, or holds garbage", () => {
    expect(loadSettings()).toEqual(DEFAULT_NAV_SETTINGS); // no localStorage in node
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
    expect(loadSettings()).toEqual(DEFAULT_NAV_SETTINGS);
    expect(() => saveSettings(DEFAULT_NAV_SETTINGS)).not.toThrow();
    vi.stubGlobal("localStorage", fakeStorage({ "atelier-settings": "{not json" }));
    expect(loadSettings()).toEqual(DEFAULT_NAV_SETTINGS);
  });

  it("clamps sensitivity to 0.5..2 and drops wrongly typed fields", () => {
    expect(sanitizeSettings({ sensitivity: 9 }).sensitivity).toBe(2);
    expect(sanitizeSettings({ sensitivity: 0 }).sensitivity).toBe(0.5);
    expect(sanitizeSettings({ sensitivity: NaN }).sensitivity).toBe(1);
    expect(sanitizeSettings({ wheel: "sideways", locked: "yes", snap: 1 })).toEqual(DEFAULT_NAV_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_NAV_SETTINGS);
    expect(sanitizeSettings([1, 2])).toEqual(DEFAULT_NAV_SETTINGS);
  });
});
