import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { CanvasHandle } from "@/components/canvas/CanvasView";
import { EditorProvider } from "@/components/editor/EditorContext";
import type { ToastOptions } from "@/lib/engine/commands/registry";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject, ObjectType } from "@/lib/engine/model/types";
import { SpatialIndex } from "@/lib/engine/spatial/spatial-index";

export function obj(type: ObjectType, id: string, extra: Record<string, unknown> = {}): NewObject {
  return { ...defaultsFor(type), id, ...extra } as NewObject;
}

export type TestEditor = ReturnType<typeof makeEditor>;

/** A board, selection and fake canvas handle wired into a real EditorProvider. */
export function makeEditor(objs: NewObject[] = []) {
  const doc = new BoardDoc();
  doc.createMany(objs);
  doc.stopCapturing();
  const selection = new SelectionStore();
  const container = document.createElement("div");
  document.body.append(container);
  const setCamera = vi.fn();
  let camera = { x: 0, y: 0, z: 1 };
  const setTool = vi.fn();
  const handle = {
    doc,
    selection,
    index: new SpatialIndex(doc),
    container: () => container,
    getCamera: () => camera,
    setCamera: (c: typeof camera, o?: unknown) => {
      camera = c;
      setCamera(c, o);
    },
    viewport: () => ({ w: 1000, h: 800 }),
    settings: () => ({ wheel: "zoom", sensitivity: 1, locked: false, snap: true, penOnlyDraws: false }),
    tools: { setTool },
  } as unknown as CanvasHandle;
  const toasts: ToastOptions[] = [];
  const navigate = vi.fn();
  const toast = (o: ToastOptions) => {
    toasts.push(o);
  };
  const wrap = (ui: ReactElement) => (
    <EditorProvider handle={handle} toast={toast} navigate={navigate}>
      {ui}
    </EditorProvider>
  );
  return {
    doc,
    selection,
    handle,
    toasts,
    navigate,
    setCamera,
    setTool,
    wrap,
    container,
    render: (ui: ReactElement) => render(wrap(ui)),
  };
}
