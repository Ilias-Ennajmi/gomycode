import type { ReactNode } from "react";
import type { ViewerBlock, ViewerRun } from "@/lib/viewer/viewer-types";

/*
 * Rich text for a visitor: runs of plain text drawn as React text nodes (so `<img onerror=...>` in a sticky is just
 * characters) inside <strong>/<em>/<u>/<s>, and links only when the href is http(s) or mailto (the server checked it once;
 * it is checked again here). Nothing in this file creates HTML from a string.
 */

const SAFE_HREF = /^(https?:|mailto:)/i;

export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  return SAFE_HREF.test(compact) ? raw.trim().replace(/[\u0000-\u001f\u007f]+/g, "") : null;
}

function Run({ run }: { run: ViewerRun }) {
  let node: ReactNode = run.text;
  if (run.marks.includes("bold")) node = <strong>{node}</strong>;
  if (run.marks.includes("italic")) node = <em>{node}</em>;
  if (run.marks.includes("underline")) node = <u>{node}</u>;
  if (run.marks.includes("strike")) node = <s>{node}</s>;
  const href = run.href === undefined ? null : safeHref(run.href);
  if (href) node = <a href={href} target="_blank" rel="noopener noreferrer nofollow">{node}</a>;
  const size = typeof run.size === "number" && run.size >= 8 && run.size <= 400 ? run.size : null;
  return size ? <span style={{ fontSize: size }}>{node}</span> : <>{node}</>;
}

function Line({ b }: { b: ViewerBlock }) {
  const style = { textAlign: b.align, lineHeight: b.lineHeight } as const;
  const runs = b.runs.map((r, i) => <Run key={i} run={r} />);
  const body = runs.length === 0 ? <br /> : runs;
  switch (b.kind) {
    case "h1":
      return <h1 style={style}>{body}</h1>;
    case "h2":
      return <h2 style={style}>{body}</h2>;
    case "h3":
      return <h3 style={style}>{body}</h3>;
    case "li":
      return <li style={style}>{body}</li>;
    default:
      return <p style={style}>{body}</p>;
  }
}

export function BlockText({ blocks, className }: { blocks: readonly ViewerBlock[] | undefined; className?: string }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < (blocks?.length ?? 0); ) {
    const b = blocks![i];
    if (b.kind !== "li") {
      out.push(<Line key={i} b={b} />);
      i++;
      continue;
    }
    const type = b.listType === "ordered" ? "ordered" : "bullet";
    const items: ReactNode[] = [];
    const start = i;
    while (i < blocks!.length && blocks![i].kind === "li" && (blocks![i].listType === "ordered" ? "ordered" : "bullet") === type) {
      items.push(<Line key={i} b={blocks![i]} />);
      i++;
    }
    out.push(type === "ordered" ? <ol key={start}>{items}</ol> : <ul key={start}>{items}</ul>);
  }
  return <div className={`atelier-rich ${className ?? ""}`}>{out}</div>;
}
