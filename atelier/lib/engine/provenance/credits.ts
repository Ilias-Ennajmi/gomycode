import type { BoardDoc } from "../doc/board-doc";
import type { ImageObj, VideoObj } from "../model/types";
import { hasProvenance } from "./validate";

/** One line of the credits sheet (the `credits.csv` in the ZIP export, the credits page of a deck). */
export interface CreditsRow {
  file: string;
  source: string;
  credit: string;
  licence: string;
  capturedAt: string;
}

export interface CreditsOptions {
  /** Name of the file the picture has in an export. Default: the picture's title (or "image"), made unique. */
  fileFor?: (obj: ImageObj | VideoObj, index: number) => string;
  /** Also list pictures with no provenance at all, so the gaps are visible. Default false. */
  includeUncredited?: boolean;
}

// A file name made only of characters every file system accepts.
const safeName = (s: string): string =>
  s.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * The pictures on a board that carry provenance, in z-order, one row per asset (the same asset used twice is one file).
 * Reads the board document only: the object holds the provenance (it travels with snapshots and share links).
 */
export function creditsRows(doc: BoardDoc, opts: CreditsOptions = {}): CreditsRow[] {
  const rows: CreditsRow[] = [];
  const seen = new Set<string>();
  const used = new Set<string>();
  let index = 0;
  for (const o of doc.all()) {
    if (o.type !== "image" && o.type !== "video") continue;
    if (seen.has(o.assetId)) continue;
    const p = o.provenance;
    if (!hasProvenance(p) && !opts.includeUncredited) continue;
    seen.add(o.assetId);
    let file: string;
    if (opts.fileFor) {
      file = opts.fileFor(o, index);
    } else {
      const base = (o.type === "image" ? safeName(o.title) : "") || "image";
      file = base;
      for (let n = 2; used.has(file.toLowerCase()); n++) file = `${base}-${n}`;
      used.add(file.toLowerCase());
    }
    index++;
    rows.push({
      file,
      source: p?.sourceUrl ?? "",
      credit: p?.credit ?? "",
      licence: p?.licence ?? "",
      capturedAt: p?.capturedAt ?? "",
    });
  }
  return rows;
}

/**
 * One CSV cell, RFC 4180: quoted when it holds a comma, quote or line break (quotes doubled). A cell a spreadsheet would
 * read as a formula (first character = + - @ tab or CR) gets a single leading quote so it stays text.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const CREDITS_HEADER = ["file", "source", "credit", "licence", "captured"] as const;

/** The credits sheet as CSV (CRLF line endings, header row). `bom` prefixes a UTF-8 byte-order mark for Excel. */
export function creditsCsv(rows: readonly CreditsRow[], opts: { bom?: boolean } = {}): string {
  const lines = [CREDITS_HEADER.join(",")];
  for (const r of rows) lines.push([r.file, r.source, r.credit, r.licence, r.capturedAt].map(csvCell).join(","));
  return `${opts.bom ? "﻿" : ""}${lines.join("\r\n")}\r\n`;
}
