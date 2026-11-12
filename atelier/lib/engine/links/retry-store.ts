/**
 * Who retries a card's preview. The editor registers it (it owns the uploader the retry needs); the canvas objects live
 * outside the editor's React tree, so they read it from here. A read-only viewer never registers one and shows no button.
 */
type Handler = (id: string) => void;
type Listener = () => void;

let handler: Handler | null = null;
const listeners = new Set<Listener>();

export const linkRetry = {
  get: (): Handler | null => handler,
  set(next: Handler | null): void {
    if (handler === next) return;
    handler = next;
    for (const l of [...listeners]) l();
  },
  subscribe(cb: Listener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
