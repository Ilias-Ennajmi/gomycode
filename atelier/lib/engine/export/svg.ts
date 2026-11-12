// SVG writer: a Scene as a standalone, well-formed SVG. Shapes and text stay vector; pictures are embedded as data URLs or
// linked. Everything written is escaped or validated: text and attribute values are XML-escaped, a path's data may only
// contain path characters, a picture address must be an image data URL or an http(s) URL. No script, no foreignObject, no
// event attributes, no external stylesheets. Fonts are referenced by family name and not embedded.
import { toDisplayCrop } from "@/lib/engine/model/image-style";
import { LIGHT_TOKENS } from "./colors";
import { drawnFont } from "./fonts";
import { abortError } from "./protocol";
import type { ClipRect, Scene, SceneNode } from "./scene";

export interface SvgImages {
  /** The picture as a `data:image/...;base64,` URL (null = unreadable or over the size cap). `neededPx` is a size hint. */
  dataUrl(assetId: string, neededPx?: number, opts?: { noOriginal?: boolean }): Promise<string | null>;
  url(assetId: string, opts?: { noOriginal?: boolean }): string | null;
}

const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const num = (v: number): string => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : "0");
const deg = (rad: number): string => num((rad * 180) / Math.PI);

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/;
const IMAGE_HREF = /^(data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s"'<>\\]+)$/i;
const safeFamily = (f: string): string => f.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60);

function fontAttrs(font: { family: string; weight: number; italic: boolean; size: number }): string {
  const bundled = drawnFont(font);
  const asked = safeFamily(font.family);
  const stack = bundled.substituted && asked ? `'${asked}', 'Inter', sans-serif` : `'${bundled.family}', sans-serif`;
  return `font-family="${esc(stack)}" font-size="${num(font.size)}" font-weight="${Math.round(font.weight)}"${font.italic ? ' font-style="italic"' : ""}`;
}

function paintAttrs(p: { fill: string | null; stroke: string | null; strokeWidth: number; dash: number[] | null; opacity: number; cap?: "round" }): string {
  let s = ` fill="${p.fill ?? "none"}"`;
  if (p.stroke && p.strokeWidth > 0) {
    s += ` stroke="${p.stroke}" stroke-width="${num(p.strokeWidth)}" stroke-linejoin="round"`;
    if (p.cap === "round") s += ' stroke-linecap="round"';
    if (p.dash && p.dash.length) s += ` stroke-dasharray="${p.dash.map(num).join(" ")}"`;
  }
  if (p.opacity < 1) s += ` opacity="${num(Math.max(0, p.opacity))}"`;
  return s;
}

/** A well-formed standalone SVG of the scene. Images the provider cannot supply are drawn as hatched-grey boxes. */
export async function sceneToSvg(
  scene: Scene,
  o: { imageMode: "embed" | "link"; images: SvgImages },
  d: { signal: AbortSignal; onProgress(ratio: number, label: string): void },
): Promise<{ svg: string; failedAssets: string[] }> {
  const check = () => {
    if (d.signal.aborted) throw abortError();
  };
  check();
  const defs: string[] = [];
  const body: string[] = [];
  const failed = new Set<string>();
  const clipIds = new Map<ClipRect, string>();
  let counter = 0;
  let grayDefined = false;

  const clipId = (c: ClipRect): string => {
    const have = clipIds.get(c);
    if (have) return have;
    const id = `c${++counter}`;
    clipIds.set(c, id);
    const tf = c.rotation ? ` transform="rotate(${deg(c.rotation)} ${num(c.x + c.w / 2)} ${num(c.y + c.h / 2)})"` : "";
    defs.push(`<clipPath id="${id}"><rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.w)}" height="${num(c.h)}"${tf}/></clipPath>`);
    return id;
  };
  const wrapClip = (clip: ClipRect | null, inner: string): string => {
    const chain: ClipRect[] = [];
    for (let c = clip; c; c = c.outer ?? null) chain.unshift(c);
    return chain.reduceRight((acc, c) => `<g clip-path="url(#${clipId(c)})">${acc}</g>`, inner);
  };

  const hatched = (x: number, y: number, w: number, h: number): string =>
    `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${LIGHT_TOKENS["--color-border"]}" stroke="${LIGHT_TOKENS["--color-muted"]}" stroke-opacity="0.35"/>`;

  async function imageNode(n: Extract<SceneNode, { kind: "image" }>): Promise<string> {
    let href: string | null = null;
    if (o.imageMode === "embed") href = await o.images.dataUrl(n.assetId, Math.max(n.w, n.h) * 2, { noOriginal: n.noOriginal });
    else href = o.images.url(n.assetId, { noOriginal: n.noOriginal });
    if (!href || !IMAGE_HREF.test(href)) {
      failed.add(n.assetId);
      const tf = n.rotation ? ` transform="rotate(${deg(n.rotation)} ${num(n.x + n.w / 2)} ${num(n.y + n.h / 2)})"` : "";
      return `<g${tf}>${hatched(n.x, n.y, n.w, n.h)}</g>`;
    }
    const hw = n.w / 2;
    const hh = n.h / 2;
    let el: string;
    if (n.fit === "cover") {
      el = `<image x="${num(-hw)}" y="${num(-hh)}" width="${num(n.w)}" height="${num(n.h)}" preserveAspectRatio="xMidYMid slice"`;
    } else if (n.crop) {
      const c = toDisplayCrop(n.crop, n.flipX, n.flipY);
      const W = n.w / c.w;
      const H = n.h / c.h;
      el = `<image x="${num(-hw - c.x * W)}" y="${num(-hh - c.y * H)}" width="${num(W)}" height="${num(H)}" preserveAspectRatio="none"`;
    } else {
      el = `<image x="${num(-hw)}" y="${num(-hh)}" width="${num(n.w)}" height="${num(n.h)}" preserveAspectRatio="none"`;
    }
    el += ` href="${esc(href)}" xlink:href="${esc(href)}"/>`;
    if (n.flipX || n.flipY) el = `<g transform="scale(${n.flipX ? -1 : 1} ${n.flipY ? -1 : 1})">${el}</g>`;
    if (n.rx > 0 || n.ry > 0 || n.crop || n.fit) {
      const id = `m${++counter}`;
      defs.push(`<clipPath id="${id}"><rect x="${num(-hw)}" y="${num(-hh)}" width="${num(n.w)}" height="${num(n.h)}"${n.rx > 0 || n.ry > 0 ? ` rx="${num(n.rx)}" ry="${num(n.ry)}"` : ""}/></clipPath>`);
      el = `<g clip-path="url(#${id})">${el}</g>`;
    }
    let attrs = "";
    if (n.grayscale) {
      if (!grayDefined) {
        grayDefined = true;
        defs.push('<filter id="gray" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter>');
      }
      attrs += ' filter="url(#gray)"';
    }
    if (n.opacity < 1) attrs += ` opacity="${num(Math.max(0, n.opacity))}"`;
    return `<g transform="translate(${num(n.x + hw)} ${num(n.y + hh)})${n.rotation ? ` rotate(${deg(n.rotation)})` : ""}"${attrs}>${el}</g>`;
  }

  function textNode(n: Extract<SceneNode, { kind: "text" }>): string {
    const tf = `${n.rotation ? `rotate(${deg(n.rotation)} ${num(n.cx)} ${num(n.cy)}) ` : ""}translate(${num(n.x)} ${num(n.y)})`;
    const lines = n.lines
      .filter((l) => l.runs.some((r) => r.text !== ""))
      .map((l) => {
        const runs = l.runs
          .filter((r) => r.text !== "")
          .map((r) => {
            const deco = [r.marks.includes("underline") ? "underline" : "", r.marks.includes("strike") ? "line-through" : ""].filter(Boolean).join(" ");
            return `<tspan x="${num(r.x)}" ${fontAttrs(r.font)}${r.color && r.color !== n.color ? ` fill="${r.color}"` : ""}${deco ? ` text-decoration="${deco}"` : ""}>${esc(r.text)}</tspan>`;
          })
          .join("");
        return `<text y="${num(l.y)}" xml:space="preserve">${runs}</text>`;
      })
      .join("");
    return `<g transform="${tf}" fill="${n.color}"${n.opacity < 1 ? ` opacity="${num(Math.max(0, n.opacity))}"` : ""}>${lines}</g>`;
  }

  const nodes = scene.nodes;
  for (let i = 0; i < nodes.length; i++) {
    check();
    const n = nodes[i];
    let el: string | null = null;
    switch (n.kind) {
      case "rect": {
        const tf = n.rotation ? ` transform="rotate(${deg(n.rotation)} ${num(n.x + n.w / 2)} ${num(n.y + n.h / 2)})"` : "";
        el = `<rect x="${num(n.x)}" y="${num(n.y)}" width="${num(n.w)}" height="${num(n.h)}"${n.radius > 0 ? ` rx="${num(n.radius)}"` : ""}${tf}${paintAttrs(n)}/>`;
        break;
      }
      case "ellipse": {
        const tf = n.rotation ? ` transform="rotate(${deg(n.rotation)} ${num(n.x + n.w / 2)} ${num(n.y + n.h / 2)})"` : "";
        el = `<ellipse cx="${num(n.x + n.w / 2)}" cy="${num(n.y + n.h / 2)}" rx="${num(n.w / 2)}" ry="${num(n.h / 2)}"${tf}${paintAttrs(n)}/>`;
        break;
      }
      case "path":
        if (PATH_DATA.test(n.d) && n.d.trim() !== "") el = `<path d="${n.d}"${n.dx || n.dy ? ` transform="translate(${num(n.dx)} ${num(n.dy)})"` : ""}${paintAttrs(n)}/>`;
        break;
      case "image":
        el = await imageNode(n);
        break;
      case "text":
        el = textNode(n);
        break;
    }
    if (el) body.push(wrapClip(n.clip, el));
    if (i % 10 === 9) d.onProgress(((i + 1) / nodes.length) * 0.95, `Writing ${i + 1} of ${nodes.length}`);
  }
  check();
  const w = num(Math.max(scene.width, 1));
  const h = num(Math.max(scene.height, 1));
  const bg = scene.background ? `<rect width="${w}" height="${h}" fill="${scene.background}"/>` : "";
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
    (defs.length ? `<defs>${defs.join("")}</defs>\n` : "") +
    bg +
    body.join("\n") +
    `\n</svg>\n`;
  d.onProgress(1, "Done");
  return { svg, failedAssets: [...failed] };
}
