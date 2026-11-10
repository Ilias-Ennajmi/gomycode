import { createElement } from "react";
import { SPACE_ICONS } from "./spaceIcons";

/** A Space's icon by key, or nothing when the Space has none. */
export function SpaceIcon({ name, size = 20, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const entry = name ? SPACE_ICONS[name] : undefined;
  if (!entry) return null;
  return createElement(entry.icon, { size, strokeWidth: 2, "aria-hidden": true, className });
}
