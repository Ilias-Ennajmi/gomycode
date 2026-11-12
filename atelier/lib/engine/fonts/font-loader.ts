/*
 * On-demand Google Fonts for type specimen cards.
 *
 * Only the families of specimens that are on screen are ever requested; a board without specimens never contacts
 * Google. The family name is user input that ends up in a URL, so it is checked against a strict pattern first and then
 * percent-encoded; an invalid name never produces a request. Loading never blocks rendering: the specimen shows in a
 * system stack straight away and the web font swaps in (display=swap) when it arrives. Offline, slow or failing
 * networks end in "fallback" within three seconds.
 *
 * A Content-Security-Policy, when one is added to the app, must allow https://fonts.googleapis.com in style-src and
 * connect-src and https://fonts.gstatic.com in font-src.
 */

export const FALLBACK_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const CSS_ENDPOINT = "https://fonts.googleapis.com/css2";
const LOAD_TIMEOUT_MS = 3000;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/;

/** A family name that is safe to put in a Google Fonts URL: letters, digits, spaces and hyphens, 1-60 characters. */
export function isValidFontName(name: string): boolean {
  return typeof name === "string" && NAME.test(name.trim());
}

/** Single spaces, no edges. Only meaningful for a valid name. */
const normaliseName = (name: string): string => name.trim().replace(/\s+/g, " ");

const validWeight = (w: number): boolean => Number.isInteger(w) && w >= 100 && w <= 900;
function cleanWeights(weights: readonly number[]): number[] {
  const set = new Set(weights.filter(validWeight));
  if (set.size === 0) set.add(400);
  return [...set].sort((a, b) => a - b);
}

/**
 * The CSS2 API URL for a family, e.g.
 * `https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700&display=swap`.
 * Weights are de-duplicated, sorted and limited to 100-900 (none left = 400); with `italic` both the upright and the
 * italic face of each weight are requested, in the axis order the API demands. Throws for an invalid family name.
 */
export function googleFontsCssUrl(family: string, weights: readonly number[], italic: boolean): string {
  if (!isValidFontName(family)) throw new Error("Invalid font family name");
  const ws = cleanWeights(weights);
  const name = normaliseName(family)
    .split(" ")
    .map((part) => encodeURIComponent(part))
    .join("+");
  const axes = italic ? `ital,wght@${[0, 1].flatMap((i) => ws.map((w) => `${i},${w}`)).join(";")}` : `wght@${ws.join(";")}`;
  return `${CSS_ENDPOINT}?family=${name}:${axes}&display=swap`;
}

export type FontStatus = "idle" | "loading" | "loaded" | "fallback" | "not-found";

type FamilyState = {
  status: FontStatus;
  weights: Set<number>;
  italic: boolean;
  link: HTMLLinkElement | null;
  /** Settled or running loads by axes, so asking twice shares the work. */
  runs: Map<string, Promise<FontStatus>>;
  /** Serialises the loads of one family: each one widens the single stylesheet in turn. */
  chain: Promise<unknown>;
};

export type FontLoaderDeps = { fetch?: typeof fetch; doc?: Document };

type FontsApi = { load(spec: string): Promise<unknown[]> };

const keyOf = (family: string) => normaliseName(family).toLowerCase();

export class FontLoader {
  private readonly fetchFn: typeof fetch | null;
  private readonly doc: Document | null;
  private readonly families = new Map<string, FamilyState>();
  private readonly listeners = new Set<() => void>();

  constructor(deps: FontLoaderDeps = {}) {
    this.fetchFn = deps.fetch ?? (typeof fetch === "function" ? (...a: Parameters<typeof fetch>) => fetch(...a) : null);
    this.doc = deps.doc ?? (typeof document !== "undefined" ? document : null);
  }

  /** What is known about a family right now ("idle" when nothing was ever asked for it). */
  status(family: string): FontStatus {
    return this.families.get(keyOf(family))?.status ?? "idle";
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Make a family available in the page. Resolves with the final status; never rejects. Invalid names resolve
   * "not-found" without any network access.
   */
  load(family: string, weights: readonly number[], italic: boolean): Promise<FontStatus> {
    if (!isValidFontName(family)) return Promise.resolve("not-found");
    const ws = cleanWeights(weights);
    const key = keyOf(family);
    let st = this.families.get(key);
    if (!st) {
      st = { status: "idle", weights: new Set(), italic: false, link: null, runs: new Map(), chain: Promise.resolve() };
      this.families.set(key, st);
    }
    const axes = `${italic ? "i" : "n"}:${ws.join(",")}`;
    const existing = st.runs.get(axes);
    if (existing) return existing;

    const state = st;
    // A family that already arrived stays "loaded" while one more weight is fetched.
    if (state.status !== "loaded") this.set(state, "loading");
    const run = state.chain.then(() => this.run(state, normaliseName(family), ws, italic));
    state.chain = run.catch(() => undefined);
    state.runs.set(axes, run);
    // Only a font that arrived is remembered: after a failure the next request tries again.
    void run.then((s) => {
      if (s !== "loaded" && state.runs.get(axes) === run) state.runs.delete(axes);
    });
    return run;
  }

  /** Try again every family that ended in "fallback" (the network came back). */
  retryFallbacks(): void {
    for (const [key, st] of this.families) {
      if (st.status !== "fallback" || st.weights.size === 0) continue;
      void this.load(key, [...st.weights], st.italic);
    }
  }

  /** Forget a family: remove its stylesheet and let the next load start from scratch. */
  forget(family: string): void {
    const key = keyOf(family);
    const st = this.families.get(key);
    if (!st) return;
    st.link?.remove();
    this.families.delete(key);
    this.emit();
  }

  // ---- internals -----------------------------------------------------------------------------------------

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }

  private set(st: FamilyState, status: FontStatus): void {
    if (st.status === status) return;
    st.status = status;
    this.emit();
  }

  private async run(st: FamilyState, family: string, ws: number[], italic: boolean): Promise<FontStatus> {
    const doc = this.doc;
    if (!doc || !this.fetchFn) {
      this.set(st, "fallback");
      return "fallback";
    }
    const union = new Set([...st.weights, ...ws]);
    const unionItalic = st.italic || italic;
    const url = googleFontsCssUrl(family, [...union], unionItalic);
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), LOAD_TIMEOUT_MS);
    });

    const work = async (): Promise<FontStatus> => {
      // Ask the CSS endpoint first: it says "not found" (400) for a family that does not exist, which a stylesheet
      // link cannot tell apart from being offline.
      let res: Response;
      try {
        res = await this.fetchFn!(url, { signal: ctl?.signal, credentials: "omit" });
      } catch {
        return "fallback";
      }
      void res.body?.cancel().catch(() => undefined);
      if (res.status === 400 || res.status === 404) return "not-found";
      if (!res.ok) return "fallback";

      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.crossOrigin = "anonymous";
      link.href = url;
      const loaded = new Promise<boolean>((resolve) => {
        link.addEventListener("load", () => resolve(true), { once: true });
        link.addEventListener("error", () => resolve(false), { once: true });
      });
      const previous = st.link;
      doc.head.appendChild(link);
      st.link = link;
      const arrived = await loaded;
      previous?.remove();
      if (!arrived) {
        link.remove();
        st.link = null;
        return "fallback";
      }
      st.weights = union;
      st.italic = unionItalic;

      const fonts = (doc as Document & { fonts?: FontsApi }).fonts;
      if (fonts && typeof fonts.load === "function") {
        const faces = await Promise.all(ws.map((w) => fonts.load(`${italic ? "italic " : ""}${w} 1em "${family}"`).catch(() => [])));
        if (faces.some((f) => f.length === 0)) return "fallback";
      }
      return "loaded";
    };

    const result = await Promise.race([work().catch((): FontStatus => "fallback"), timeout]);
    clearTimeout(timer);
    let final: FontStatus;
    if (result === "timeout") {
      ctl?.abort();
      final = "fallback";
    } else {
      final = result;
    }
    // A family that was already loaded keeps working even if one more weight could not be fetched.
    if (final !== "loaded" && st.status === "loaded" && st.weights.size > 0) final = "loaded";
    this.set(st, final);
    return final;
  }
}

let shared: FontLoader | null = null;
/** The one loader the page shares (one stylesheet per family, however many specimens use it). */
export function getFontLoader(): FontLoader {
  if (!shared) {
    shared = new FontLoader();
    if (typeof window !== "undefined") window.addEventListener("online", () => shared?.retryFallbacks());
  }
  return shared;
}

/** Test hook: forget the shared loader (and its stylesheets). */
export function resetFontLoader(): void {
  shared = null;
}
