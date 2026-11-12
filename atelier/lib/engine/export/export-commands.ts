// Registry commands that open the Export dialog (the dialog does the work: scope, size, progress, cancel).
import type { Command } from "@/lib/engine/commands/registry";

export type ExportFormat = "png" | "jpeg" | "webp" | "svg" | "pdf" | "zip" | "backup" | "jsonCanvas";
export type ExportScope = "selection" | "frame" | "board";
/** What opens the dialog pre-set. */
export type ExportPreset = { format?: ExportFormat; scope?: ExportScope };

const open = (label: string, id: string, preset?: ExportPreset, shortcut?: string): Command => ({
  id,
  label,
  group: "board",
  shortcut,
  when: (c) => !!c.ui?.openExport,
  run: (c) => c.ui?.openExport?.(preset),
});

export const EXPORT_COMMANDS: Command[] = [
  open("Export…", "export.open", undefined, "Mod+Shift+E"),
  open("Export as PNG…", "export.png", { format: "png" }),
  open("Export as JPG…", "export.jpg", { format: "jpeg" }),
  open("Export as WebP…", "export.webp", { format: "webp" }),
  open("Export as SVG…", "export.svg", { format: "svg" }),
  open("Export as PDF deck…", "export.pdf", { format: "pdf", scope: "board" }),
];
