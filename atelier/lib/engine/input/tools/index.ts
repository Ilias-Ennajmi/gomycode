import type { Tool } from "../tool-machine";
import { createArrowTool } from "./arrow";
import { createCropTool } from "./crop";
import { createEraserTool } from "./eraser";
import { createFrameTool } from "./frame";
import { createPenTool } from "./pen";
import { createSelectTool } from "./select";
import { createShapeTool } from "./shape";
import { createStickyTool } from "./sticky";
import { createTextTool } from "./text";

export type { ArrowTool } from "./arrow";
export type { CropTool } from "./crop";
export type { FrameTool } from "./frame";
export type { PenTool } from "./pen";
export type { ShapeTool } from "./shape";
export type { StickyTool } from "./sticky";
export type { TextTool } from "./text";

/**
 * Every tool with its own object, in toolbar order. Each tool keeps gesture state, so a machine needs its own set.
 * The hand tool has no object: the canvas pans while it is active. The image tool is the toolbar's upload action.
 */
export function createAllTools(): Tool[] {
  return [
    createSelectTool(),
    createStickyTool(),
    createTextTool(),
    createShapeTool(),
    createArrowTool(),
    createPenTool("pen"),
    createPenTool("highlighter"),
    createEraserTool(),
    createFrameTool(),
    createCropTool(),
  ];
}
