import type { BoardDoc } from "../doc/board-doc";
import { richTextToPlainLines } from "../model/rich-text-html";

export type EditStart = {
  /**
   * Undo depth (`doc.undoManager.undoStack.length`) measured before the object was created. When a text object is
   * left empty, everything above that depth (creation and typing) is rolled back, so nothing of it stays on the
   * undo stack. Without it an empty text object is simply deleted.
   */
  undoDepth?: number;
  /** Typed into the editor right after it opens (the key that started editing a selected sticky). */
  initialText?: string;
  /** Select the existing text when the editor opens instead of placing the caret at the end. */
  selectAll?: boolean;
};

type Session = EditStart & { id: string };

/**
 * Which object is being edited (at most one): its text for text, stickies and shapes, its name for frames. The canvas
 * mounts the editor for `id`; tools and commands start editing, anything can stop it. Stopping an empty text object
 * removes it. Subscribers are notified with an immutable snapshot (`id` changes identity-wise only when it changes).
 */
export class EditingStore {
  private session: Session | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly doc: BoardDoc) {}

  /** Id of the object being edited, or null. */
  get id(): string | null {
    return this.session?.id ?? null;
  }

  get initialText(): string {
    return this.session?.initialText ?? "";
  }

  get selectAll(): boolean {
    return this.session?.selectAll ?? false;
  }

  /** Start editing `id`. Anything being edited at the moment is finished first. Unknown ids are ignored. */
  start(id: string, opts: EditStart = {}): void {
    if (!this.doc.get(id)) return;
    if (this.session?.id === id) return;
    this.stop();
    this.session = { id, ...opts };
    this.notify();
  }

  /** Finish editing. An empty text object is removed. Safe to call when nothing is being edited. */
  stop(): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    this.finish(s);
    this.notify();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of [...this.listeners]) cb();
  }

  private finish(s: Session): void {
    const { doc } = this;
    const obj = doc.get(s.id);
    if (!obj || obj.type !== "text") return;
    const frag = doc.content(s.id);
    const empty = !frag || richTextToPlainLines(frag).every((line) => line.trim() === "");
    if (!empty) return;

    const um = doc.undoManager;
    if (s.undoDepth !== undefined && um.undoStack.length > s.undoDepth) {
      // Creation and typing were this session's own steps: undo them all so the stack looks as if nothing happened.
      doc.stopCapturing();
      let guard = um.undoStack.length - s.undoDepth;
      while (guard-- > 0 && um.undoStack.length > s.undoDepth && doc.get(s.id)) doc.undo();
      um.clear(false, true); // and none of it is redoable
    }
    if (doc.get(s.id)) doc.remove([s.id]);
  }
}
