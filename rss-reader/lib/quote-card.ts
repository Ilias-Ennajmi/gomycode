// A highlight as a picture to share: the quote, where it's from, Reader's colours.

const COLORS: Record<string, string> = {
  yellow: "#f5c542",
  green: "#4ade80",
  blue: "#60a5fa",
  pink: "#f472b6",
};

const WIDTH = 1080;
const PADDING = 96;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** A PNG of the quote. Long ones are shortened with an ellipsis so the card stays readable. */
export async function quoteCardBlob(input: {
  text: string;
  color: string;
  title?: string;
  source?: string;
  /** Snip cards: a waveform strip and the moment's time under the quote. */
  moment?: string;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't make pictures");

  const fontSize = input.text.length > 320 ? 40 : input.text.length > 160 ? 48 : 58;
  const serif = `${fontSize}px Georgia, "Times New Roman", serif`;
  ctx.font = serif;
  const maxLines = Math.floor(900 / (fontSize * 1.45));
  let lines = wrap(ctx, input.text.trim(), WIDTH - PADDING * 2 - 40);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s,.;:]+$/, "")}…`;
  }

  const lineHeight = fontSize * 1.45;
  const quoteHeight = lines.length * lineHeight;
  const waveHeight = input.moment ? 110 : 0;
  const height = Math.max(560, PADDING * 2 + quoteHeight + 150 + waveHeight);
  canvas.width = WIDTH;
  canvas.height = height;

  // Dark paper, like the app.
  ctx.fillStyle = "#14161B";
  ctx.fillRect(0, 0, WIDTH, height);

  // The highlight colour as a bar down the left of the quote.
  ctx.fillStyle = COLORS[input.color] ?? COLORS.yellow;
  ctx.fillRect(PADDING, PADDING, 8, quoteHeight);

  ctx.fillStyle = "#F4F1EA";
  ctx.textBaseline = "top";
  ctx.font = serif;
  lines.forEach((line, i) => ctx.fillText(line, PADDING + 40, PADDING + i * lineHeight + 6));

  // Snips: a waveform strip (shaped by the words, so each card differs) and the moment.
  if (input.moment) {
    const top = PADDING + quoteHeight + 44;
    let seed = 0;
    for (const ch of input.text) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const bars = 72;
    const gap = (WIDTH - PADDING * 2) / bars;
    for (let i = 0; i < bars; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const h = 10 + (seed % 48);
      ctx.fillStyle = i < bars * 0.62 ? (COLORS[input.color] ?? COLORS.blue) : "#3A3D47";
      ctx.fillRect(PADDING + i * gap, top + (56 - h) / 2, gap * 0.55, h);
    }
    ctx.font = "600 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillStyle = "#C9C4B8";
    ctx.fillText(input.moment, PADDING, top + 68);
  }

  // Source line and brand.
  const footerY = PADDING + quoteHeight + 56 + waveHeight;
  ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#C9C4B8";
  const attribution = [input.title, input.source].filter(Boolean).join(" · ");
  if (attribution) {
    const short =
      ctx.measureText(attribution).width > WIDTH - PADDING * 2
        ? `${attribution.slice(0, 60)}…`
        : attribution;
    ctx.fillText(short, PADDING, footerY);
  }
  ctx.font = "700 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#A78BFA";
  ctx.fillText("Reader", PADDING, height - PADDING + 12);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not make the picture"))),
      "image/png"
    )
  );
}

/** Shares the picture (or downloads it where sharing files isn't possible). */
export async function shareQuoteImage(input: Parameters<typeof quoteCardBlob>[0]) {
  const blob = await quoteCardBlob(input);
  const file = new File([blob], "highlight.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: input.title ?? "" });
      return "shared" as const;
    } catch (error) {
      if ((error as Error).name === "AbortError") return "cancelled" as const;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "reader-highlight.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded" as const;
}
