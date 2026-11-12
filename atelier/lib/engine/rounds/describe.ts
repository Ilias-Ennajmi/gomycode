// Plain-text names for objects, for the compare view's list of what was removed (nothing there is drawn on the canvas).
import { blocksToPlainText, fragmentToBlocks } from "@/lib/engine/export/text-layout";
import type { CanvasObject } from "@/lib/engine/model/types";
import type * as Y from "yjs";

const TYPE_NAMES: Record<CanvasObject["type"], string> = {
  image: "Image",
  text: "Text",
  sticky: "Sticky note",
  shape: "Shape",
  arrow: "Arrow",
  frame: "Frame",
  stroke: "Drawing",
  group: "Group",
  video: "Video",
  link: "Link card",
  embed: "Embed",
  swatch: "Colour swatch",
  palette: "Palette",
  typeSpecimen: "Type specimen",
};

const clip = (s: string, n = 40): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "Sticky note “hello”", "Image “moodboard”", "Shape": what a person would call the object. */
export function describeObject(o: CanvasObject, content?: Y.XmlFragment): string {
  const kind = TYPE_NAMES[o.type] ?? "Object";
  let name = "";
  if (o.type === "frame") name = o.name;
  else if (o.type === "image") name = o.title;
  else if (o.type === "link") name = o.title;
  else if (o.type === "embed") name = o.title;
  else if (o.type === "arrow") name = o.label;
  else if (content) name = blocksToPlainText(fragmentToBlocks(content));
  name = name.replace(/\s+/g, " ").trim();
  return name ? `${kind} “${clip(name)}”` : kind;
}
