// Vector paths as absolute commands (move, line, cubic, close) for writers that have no SVG path parser (the PDF writer).
// SVG path data in the scene (M L H V C S Q T A Z, absolute and relative) is parsed into the same commands; quadratic
// curves and arcs become cubic Beziers.
import type { Point } from "@/lib/engine/model/types";

export type Cmd = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

/** 2D affine matrix [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function rotateAbout(angle: number, cx: number, cy: number): Matrix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

/** `a` applied after `b`. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export const scaling = (k: number): Matrix => [k, 0, 0, k, 0, 0];
export const translation = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

export function apply(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function transformCmds(cmds: Cmd[], m: Matrix): Cmd[] {
  return cmds.map((c): Cmd => {
    if (c[0] === "Z") return c;
    if (c[0] === "C") {
      const p1 = apply(m, c[1], c[2]);
      const p2 = apply(m, c[3], c[4]);
      const p3 = apply(m, c[5], c[6]);
      return ["C", p1.x, p1.y, p2.x, p2.y, p3.x, p3.y];
    }
    const p = apply(m, c[1], c[2]);
    return [c[0], p.x, p.y];
  });
}

const K = 0.5522847498307936; // cubic approximation of a quarter circle

/** A rectangle with optionally rounded corners (radii are clamped to half the short side). */
export function roundRectCmds(x: number, y: number, w: number, h: number, radius: number): Cmd[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) return [["M", x, y], ["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["Z"]];
  const k = r * K;
  return [
    ["M", x + r, y],
    ["L", x + w - r, y],
    ["C", x + w - r + k, y, x + w, y + r - k, x + w, y + r],
    ["L", x + w, y + h - r],
    ["C", x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
    ["L", x + r, y + h],
    ["C", x + r - k, y + h, x, y + h - r + k, x, y + h - r],
    ["L", x, y + r],
    ["C", x, y + r - k, x + r - k, y, x + r, y],
    ["Z"],
  ];
}

export function ellipseCmds(x: number, y: number, w: number, h: number): Cmd[] {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  const kx = rx * K;
  const ky = ry * K;
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ["C", cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ["C", cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ["C", cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ["Z"],
  ];
}

/** An SVG arc segment as cubic Beziers (endpoint to centre parameterisation, W3C implementation notes F.6). */
function arcToCubics(x1: number, y1: number, rxIn: number, ryIn: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Cmd[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [["L", x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segs;
  const t = (4 / 3) * Math.tan(step / 4);
  const out: Cmd[] = [];
  let a1 = theta1;
  const point = (a: number, ddx: number, ddy: number) => {
    const ex = rx * Math.cos(a);
    const ey = ry * Math.sin(a);
    return {
      x: cx + cosPhi * ex - sinPhi * ey,
      y: cy + sinPhi * ex + cosPhi * ey,
      dx: cosPhi * ddx - sinPhi * ddy,
      dy: sinPhi * ddx + cosPhi * ddy,
    };
  };
  for (let i = 0; i < segs; i++) {
    const a2 = a1 + step;
    const p1 = point(a1, -rx * Math.sin(a1), ry * Math.cos(a1));
    const p2 = point(a2, -rx * Math.sin(a2), ry * Math.cos(a2));
    out.push(["C", p1.x + t * p1.dx, p1.y + t * p1.dy, p2.x - t * p2.dx, p2.y - t * p2.dy, i === segs - 1 ? x2 : p2.x, i === segs - 1 ? y2 : p2.y]);
    a1 = a2;
  }
  return out;
}

const TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const MAX_COMMANDS = 200_000;

/** Parse SVG path data. Malformed or hostile data yields what could be read, never throws. */
export function parsePathD(d: string): Cmd[] {
  const tokens = d.match(TOKEN) ?? [];
  const out: Cmd[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCtl: Point | null = null; // for S and T reflection
  let lastQuad: Point | null = null;
  let cmd = "";
  const num = (): number => {
    const n = Number(tokens[i++]);
    return Number.isFinite(n) ? n : 0;
  };
  while (i < tokens.length && out.length < MAX_COMMANDS) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (cmd === "" || cmd === "Z" || cmd === "z") break;
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const need = ARGS[up];
    if (need === undefined) break;
    if (up === "Z") {
      out.push(["Z"]);
      cx = sx;
      cy = sy;
      lastCtl = lastQuad = null;
      continue;
    }
    if (i + need > tokens.length || tokens.slice(i, i + need).some((t) => /^[A-Za-z]$/.test(t))) break;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (up) {
      case "M": {
        cx = ox + num();
        cy = oy + num();
        sx = cx;
        sy = cy;
        out.push(["M", cx, cy]);
        cmd = rel ? "l" : "L"; // further pairs are implicit line-tos
        lastCtl = lastQuad = null;
        break;
      }
      case "L":
        cx = ox + num();
        cy = oy + num();
        out.push(["L", cx, cy]);
        lastCtl = lastQuad = null;
        break;
      case "H":
        cx = (rel ? cx : 0) + num();
        out.push(["L", cx, cy]);
        lastCtl = lastQuad = null;
        break;
      case "V":
        cy = (rel ? cy : 0) + num();
        out.push(["L", cx, cy]);
        lastCtl = lastQuad = null;
        break;
      case "C": {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(), x = ox + num(), y = oy + num();
        out.push(["C", x1, y1, x2, y2, x, y]);
        lastCtl = { x: x2, y: y2 };
        lastQuad = null;
        cx = x;
        cy = y;
        break;
      }
      case "S": {
        const x1 = lastCtl ? 2 * cx - lastCtl.x : cx;
        const y1 = lastCtl ? 2 * cy - lastCtl.y : cy;
        const x2 = ox + num(), y2 = oy + num(), x = ox + num(), y = oy + num();
        out.push(["C", x1, y1, x2, y2, x, y]);
        lastCtl = { x: x2, y: y2 };
        lastQuad = null;
        cx = x;
        cy = y;
        break;
      }
      case "Q":
      case "T": {
        let qx: number;
        let qy: number;
        if (up === "Q") {
          qx = ox + num();
          qy = oy + num();
        } else {
          qx = lastQuad ? 2 * cx - lastQuad.x : cx;
          qy = lastQuad ? 2 * cy - lastQuad.y : cy;
        }
        const x = ox + num();
        const y = oy + num();
        out.push(["C", cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y]);
        lastQuad = { x: qx, y: qy };
        lastCtl = null;
        cx = x;
        cy = y;
        break;
      }
      case "A": {
        const rx = num(), ry = num(), rot = num(), large = num() !== 0, sweep = num() !== 0;
        const x = ox + num();
        const y = oy + num();
        out.push(...arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y));
        cx = x;
        cy = y;
        lastCtl = lastQuad = null;
        break;
      }
    }
  }
  return out;
}

/** Bounding box of the commands' points (control points included, so it may be slightly generous). */
export function cmdBounds(cmds: Cmd[]): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cmds) {
    for (let i = 1; i < c.length; i += 2) {
      const x = c[i] as number;
      const y = c[i + 1] as number;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x0 <= x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
