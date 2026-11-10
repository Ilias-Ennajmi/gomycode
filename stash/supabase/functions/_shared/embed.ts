// Embeddings with the model built into Supabase Edge Functions: gte-small, 384 numbers, unit length.
// Shared by stash-worker-proxy (/embed) and stash-embed. No key, no external call.

export const EMBED_MODEL = "gte-small";
export const EMBED_DIMS = 384;

// The runtime provides this global (https://supabase.com/docs/guides/functions/ai-models).
declare const Supabase: {
  ai: { Session: new (model: string) => { run(input: string, options: Record<string, unknown>): Promise<unknown> } };
};

let session: { run(input: string, options: Record<string, unknown>): Promise<unknown> } | null = null;

/** Cuts every input to `maxChars`, embeds them one after the other. Throws on a wrong shape. */
export async function embed(inputs: string[], maxChars: number): Promise<number[][]> {
  session ??= new Supabase.ai.Session(EMBED_MODEL);
  const out: number[][] = [];
  for (const text of inputs) {
    const vector = await session.run(text.slice(0, maxChars), { mean_pool: true, normalize: true });
    if (!Array.isArray(vector) || vector.length !== EMBED_DIMS || vector.some((x) => typeof x !== "number")) {
      throw new Error("embedding has the wrong shape");
    }
    out.push(vector as number[]);
  }
  return out;
}

/** `input` as the contract allows it: a non-empty string or array of strings, at most `max`. Null otherwise. */
export function cleanInputs(input: unknown, max: number, allowString: boolean): string[] | null {
  const list = typeof input === "string" && allowString ? [input] : input;
  if (!Array.isArray(list) || list.length === 0 || list.length > max) return null;
  if (list.some((x) => typeof x !== "string" || x.trim() === "")) return null;
  return list as string[];
}

export const embedResponse = (embeddings: number[][]) => ({ embeddings, model: EMBED_MODEL, dims: EMBED_DIMS });
