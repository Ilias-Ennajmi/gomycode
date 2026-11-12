import { act, render } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { CanvasView, type CanvasHandle } from "@/components/canvas/CanvasView";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { EditingStore } from "@/lib/engine/input/editing-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { createRef } from "react";

const fakeEditor = () => ({ id: "ed", isDestroyed: false }) as unknown as Editor;

describe("EditingStore editor slot", () => {
  it("holds the live Tiptap editor, notifies subscribers and clears when editing stops", () => {
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("sticky") } as NewObject);
    const store = new EditingStore(doc);
    const cb = vi.fn();
    store.subscribe(cb);
    expect(store.editor).toBeNull();
    store.start(id);
    cb.mockClear();
    const ed = fakeEditor();
    store.setEditor(ed);
    expect(store.editor).toBe(ed);
    expect(cb).toHaveBeenCalledTimes(1);
    store.setEditor(ed); // same editor: no churn
    expect(cb).toHaveBeenCalledTimes(1);
    store.stop();
    expect(store.editor).toBeNull();
  });

  it("an editor that arrives after editing stopped is ignored", () => {
    const doc = new BoardDoc();
    const store = new EditingStore(doc);
    store.setEditor(fakeEditor());
    expect(store.editor).toBeNull();
  });
});

describe("EditableContent publishes the editor", () => {
  it("the editing store holds the Tiptap editor while a sticky is being edited", async () => {
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("sticky"), x: 0, y: 0 } as NewObject);
    const ref = createRef<CanvasHandle>();
    const assets = { url: () => null, available: () => null };
    render(<CanvasView ref={ref} doc={doc} assets={assets} initialCamera={{ x: 0, y: 0, z: 1 }} />);
    expect(ref.current!.editing.editor).toBeNull();
    act(() => ref.current!.editing.start(id));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(ref.current!.editing.editor).not.toBeNull();
    expect(ref.current!.editing.editor!.isEditable).toBe(true);
    act(() => ref.current!.editing.stop());
    expect(ref.current!.editing.editor).toBeNull();
  });
});
