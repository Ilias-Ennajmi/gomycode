"use client";

import { MARK_CARDS, WORDMARK } from "@/components/brand/paths";
import { spaceVar } from "@/components/ui/space";
import { barPercent, monthLabel, type Wrapped } from "@/lib/wrapped";

/*
 * Saved Wrapped as a picture: the month drawn on a canvas in the brand's look and
 * shared as a PNG. Every colour and font is read from the page's tokens at draw time
 * (the Wrapped card forces the dark brand tokens), so nothing is hard-coded here.
 */

export const POSTER = { width: 1080, height: 1350 } as const;

export type PosterModel = {
  title: string;
  stats: { label: string; value: string; accent: boolean }[];
  note: string | null;
  spaces: { name: string; count: string; color: string; percent: number }[];
  creators: { rank: string; handle: string; count: string }[];
};

/** What the poster says, worked out from the month's numbers (pure, unit-tested). */
export function posterModel(w: Wrapped, current: boolean): PosterModel {
  const max = Math.max(1, ...w.topSpaces.map((s) => s.count));
  return {
    title: `${monthLabel(w.month)}${current ? " so far" : ""}`,
    stats: [
      { label: "saved", value: String(w.saved), accent: false },
      { label: "watched", value: String(w.watched), accent: false },
      { label: "applied", value: String(w.applied), accent: true },
    ],
    note:
      w.kept > 0 || w.recalled > 0
        ? `${w.kept} kept · ${w.recalled} recall ${w.recalled === 1 ? "answer" : "answers"}${w.saved > 0 ? ` · ${Math.round((w.watched / w.saved) * 100)}% watched` : ""}`
        : null,
    spaces: w.topSpaces.slice(0, 3).map((s) => ({ name: s.name, count: String(s.count), color: s.color, percent: barPercent(s.count, max) })),
    creators: w.topCreators.slice(0, 3).map((c, i) => ({ rank: String(i + 1), handle: c.handle, count: `${c.count} ${c.count === 1 ? "save" : "saves"}` })),
  };
}

export function posterFileName(month: string): string {
  return `stash-wrapped-${month.slice(0, 7)}.png`;
}

type Look = { token: (name: string) => string; display: string; body: string };

/** Reads the tokens in effect on `el` (the Wrapped card) and the two font families. */
function lookOf(el: HTMLElement): Look {
  const style = getComputedStyle(el);
  const probe = document.createElement("span");
  probe.className = "text-hero";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  el.appendChild(probe);
  const display = getComputedStyle(probe).fontFamily;
  probe.remove();
  return { token: (name) => style.getPropertyValue(name).trim(), display, body: style.fontFamily };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Draws the poster. Returns the canvas (the caller turns it into a PNG). */
export async function drawPoster(model: PosterModel, el: HTMLElement): Promise<HTMLCanvasElement> {
  const look = lookOf(el);
  const c = (name: string) => look.token(name);
  const display = (px: number, weight = 800) => `${weight} ${px}px ${look.display}`;
  const body = (px: number, weight = 600) => `${weight} ${px}px ${look.body}`;
  try {
    await Promise.all([document.fonts.load(display(96)), document.fonts.load(body(36)), document.fonts.load(body(36, 700))]);
  } catch {
    // the fallback font draws instead
  }

  const { width: W, height: H } = POSTER;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const pad = 72;
  const inner = W - pad * 2;

  ctx.fillStyle = c("--surface");
  ctx.fillRect(0, 0, W, H);

  // Brand: the mark on its tile, then the wordmark.
  const tile = 96;
  const k = tile / 108;
  ctx.save();
  ctx.translate(pad, pad);
  ctx.scale(k, k);
  ctx.fillStyle = c("--brand-ink");
  roundRect(ctx, 0, 0, 108, 108, 26);
  ctx.fill();
  ctx.strokeStyle = c("--border");
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const card of MARK_CARDS) {
    ctx.globalAlpha = card.opacity;
    ctx.fillStyle = c("--brand-lime");
    ctx.fill(new Path2D(card.d));
  }
  ctx.restore();
  const wk = 52 / WORDMARK.height;
  ctx.save();
  ctx.translate(pad + tile + 24, pad + (tile - 52) / 2);
  ctx.scale(wk, wk);
  ctx.fillStyle = c("--text-primary");
  ctx.fill(new Path2D(WORDMARK.d));
  ctx.restore();

  let y = pad + tile + 84;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c("--brand-lime");
  ctx.font = body(34, 700);
  ctx.fillText("Saved Wrapped", pad, y);
  y += 84;
  ctx.fillStyle = c("--text-primary");
  ctx.font = display(76);
  ctx.fillText(fit(ctx, model.title, inner), pad, y);

  // Saved / watched / applied.
  y += 56;
  const gap = 20;
  const tw = (inner - gap * 2) / 3;
  const th = 230;
  model.stats.forEach((s, i) => {
    const x = pad + i * (tw + gap);
    ctx.fillStyle = c("--surface-raised");
    roundRect(ctx, x, y, tw, th, 32);
    ctx.fill();
    ctx.fillStyle = s.accent ? c("--brand-lime") : c("--text-primary");
    ctx.font = display(112);
    ctx.fillText(fit(ctx, s.value, tw - 48), x + 28, y + 128);
    ctx.fillStyle = c("--text-secondary");
    ctx.font = body(32, 700);
    ctx.fillText(s.label, x + 28, y + 186);
  });
  y += th;
  if (model.note) {
    y += 52;
    ctx.fillStyle = c("--text-secondary");
    ctx.font = body(28);
    ctx.fillText(fit(ctx, model.note, inner), pad, y);
  }

  if (model.spaces.length) {
    y += 76;
    ctx.fillStyle = c("--text-secondary");
    ctx.font = body(30, 700);
    ctx.fillText("Top Spaces", pad, y);
    y += 24;
    for (const s of model.spaces) {
      const h = 76;
      ctx.fillStyle = c("--surface-raised");
      roundRect(ctx, pad, y, inner, h, h / 2);
      ctx.fill();
      ctx.fillStyle = c(spaceVar(s.color as Parameters<typeof spaceVar>[0]));
      roundRect(ctx, pad, y, Math.max(h, (inner * s.percent) / 100), h, h / 2);
      ctx.fill();
      // Name and count on a solid chip, so they read over any bar length.
      ctx.font = body(30, 700);
      const name = fit(ctx, s.name, inner - 220);
      const chip = ctx.measureText(name).width + ctx.measureText(s.count).width + 76;
      ctx.fillStyle = c("--background");
      roundRect(ctx, pad + 10, y + 10, chip, h - 20, (h - 20) / 2);
      ctx.fill();
      ctx.fillStyle = c("--text-primary");
      ctx.fillText(name, pad + 36, y + 49);
      ctx.fillStyle = c("--text-secondary");
      ctx.fillText(s.count, pad + 36 + ctx.measureText(name).width + 18, y + 49);
      y += h + 16;
    }
  }

  if (model.creators.length && y < H - 330) {
    y += 56;
    ctx.fillStyle = c("--text-secondary");
    ctx.font = body(30, 700);
    ctx.fillText("Top creators", pad, y);
    y += 20;
    for (const cr of model.creators) {
      if (y > H - 190) break;
      y += 58;
      ctx.fillStyle = c("--surface-raised");
      ctx.beginPath();
      ctx.arc(pad + 24, y - 11, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c("--text-primary");
      ctx.font = display(26, 700);
      ctx.textAlign = "center";
      ctx.fillText(cr.rank, pad + 24, y - 2);
      ctx.textAlign = "left";
      ctx.font = body(32);
      ctx.fillText(fit(ctx, cr.handle, inner - 280), pad + 68, y);
      ctx.fillStyle = c("--text-secondary");
      ctx.font = body(28);
      ctx.textAlign = "right";
      ctx.fillText(cr.count, W - pad, y);
      ctx.textAlign = "left";
    }
  }

  ctx.fillStyle = c("--text-tertiary") || c("--text-secondary");
  ctx.font = body(26);
  ctx.fillText("My month in Stash", pad, H - pad + 8);
  return canvas;
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Web Share with the PNG where the phone can; otherwise the PNG is downloaded. */
export async function sharePoster(canvas: HTMLCanvasElement, fileName: string, text: string): Promise<ShareOutcome> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("no image");
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "My month in Stash", text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // sharing refused: fall through to the download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
