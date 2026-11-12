import type * as Y from "yjs";

const cache = new WeakMap<Y.UndoManager, Y.UndoManager>();

/**
 * A view of a document's undo manager that an editor plugin may "destroy" without harm. The Tiptap/ProseMirror undo
 * plugin owns the manager it is given: when the editor closes it destroys it, which would silence undo for the whole
 * board. This wrapper forwards everything to the real manager except `destroy`, which only removes the listeners
 * the editor added through `on`. Methods run with the real manager as `this` (Yjs identifies its own undo
 * transactions by that identity, so redo depends on it); the same wrapper is returned for the same manager.
 */
export function sharedUndoManager(manager: Y.UndoManager): Y.UndoManager {
  const existing = cache.get(manager);
  if (existing) return existing;

  const added: Array<[string, (...args: never[]) => void]> = [];
  const proxy = new Proxy(manager, {
    get(target, prop) {
      if (prop === "destroy") {
        return () => {
          for (const [name, fn] of added) target.off(name as "stack-item-added", fn as never);
          added.length = 0;
        };
      }
      if (prop === "on") {
        return (name: string, fn: (...args: never[]) => void) => {
          added.push([name, fn]);
          return target.on(name as "stack-item-added", fn as never);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      // Prototype methods (undo, redo, stopCapturing, ...) must run against the real manager; own properties such as
      // the afterTransaction handler are registered by identity and must stay as they are.
      if (typeof value === "function" && !Object.prototype.hasOwnProperty.call(target, prop)) {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
  });
  cache.set(manager, proxy);
  return proxy;
}
