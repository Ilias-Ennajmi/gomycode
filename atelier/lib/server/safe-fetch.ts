import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * SSRF-safe HTTP(S) fetcher for server routes that fetch a URL a user supplied (link previews).
 *
 * Defences, in order:
 *  1. parseSafeUrl: http(s) only, no credentials, ports 80/443 only, no localhost-style names, and IP literals in every
 *     spelling (decimal, octal, hex, short, IPv4-mapped IPv6) are normalised by the WHATWG URL parser, then range-checked.
 *  2. DNS is resolved by us, once per hop. EVERY returned address must be public, or the hop is refused.
 *  3. The connection is pinned: the transport gets a `lookup` that only ever answers with the addresses we validated, so
 *     a second, different DNS answer (rebinding) cannot reach the socket. The URL keeps its hostname, so Host and TLS SNI
 *     (and certificate verification) are for the real name.
 *  4. Redirects are followed by hand (max 3), each target going through 1-3 again. Nothing (cookies, auth, referer) is
 *     carried over between hops.
 *  5. One total timeout covers DNS, connect, headers and body. The body is counted as it streams and aborted at the cap.
 *  6. The content type is checked before the body is read; encoded bodies are refused (we never decompress).
 */

export type SafeFetchCode = "bad-url" | "blocked-address" | "too-many-redirects" | "timeout" | "too-large" | "bad-content-type" | "http-status";

export class SafeFetchError extends Error {
  code: SafeFetchCode;
  /** The HTTP status, for `http-status`. */
  status?: number;
  constructor(code: SafeFetchCode, status?: number) {
    super(code); // never an address or hostname: messages must not reveal what is internal
    this.name = "SafeFetchError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Address classification

function parseIPv4(s: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const out: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const part = m[i];
    if (part.length > 1 && part.startsWith("0")) return null; // 010.0.0.1 is octal to some resolvers: ambiguous, so unparseable
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out as [number, number, number, number];
}

function blockedV4([a, b, c]: readonly [number, number, number, number]): boolean {
  return (
    a === 0 || // 0/8 this network
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    a === 127 ||
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0/24, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

function parseIPv6(input: string): number[] | null {
  if (!/^[0-9a-fA-F:.]+$/.test(input) || !input.includes(":")) return null;
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string, allowV4Tail: boolean): number[] | null => {
    if (part === "") return [];
    const items = part.split(":");
    const out: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.includes(".")) {
        if (!allowV4Tail || i !== items.length - 1) return null;
        const v4 = parseIPv4(item);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(item)) return null;
        out.push(parseInt(item, 16));
      }
    }
    return out;
  };
  if (halves.length === 1) {
    const g = toGroups(halves[0], true);
    return g && g.length === 8 ? g : null;
  }
  const head = toGroups(halves[0], false);
  const tail = toGroups(halves[1], true);
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null; // "::" stands for at least one zero group
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

function blockedV6(g: readonly number[]): boolean {
  const embedded = () => [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255] as const;
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zero(0, 5) && g[5] === 0xffff) return blockedV4(embedded()); // ::ffff:a.b.c.d (IPv4-mapped)
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return blockedV4(embedded()); // 64:ff9b::/96 (NAT64)
  // Allow only global unicast 2000::/3; everything else (::/96 incl. :: and ::1, fc00::/7, fe80::/10, fec0::/10, ff00::/8,
  // 100::/64, 64:ff9b:1::/48, ::ffff:0:0:0/96, ...) is blocked by omission.
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2001 && g[1] < 0x0200) return true; // 2001::/23 IETF protocol assignments (Teredo, ORCHID, ...)
  if (g[0] === 0x2002) return true; // 6to4
  if (g[0] === 0x3fff && g[1] < 0x1000) return true; // documentation 3fff::/20
  return false;
}

/**
 * True when connecting to this address could reach something that is not the public internet. Takes ONLY canonical
 * dotted-quad IPv4 or standard IPv6 text (what DNS hands back); anything else, including decimal/octal/hex IPv4 spellings,
 * brackets, zone ids and garbage, is unparseable and therefore blocked (fail closed).
 */
export function isBlockedAddress(ip: string): boolean {
  if (typeof ip !== "string") return true;
  if (ip.includes(":")) {
    const g = parseIPv6(ip);
    return g === null || blockedV6(g);
  }
  const v4 = parseIPv4(ip);
  return v4 === null || blockedV4(v4);
}

// ---------------------------------------------------------------------------------------------------------------------
// URL validation

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa"];

/**
 * Parses and vets a user-supplied URL. Throws SafeFetchError: "bad-url" for anything malformed or not allowed by shape,
 * "blocked-address" for an IP literal (in any spelling) that is not public. Hostnames are resolved later, per hop.
 */
export function parseSafeUrl(raw: string): URL {
  if (typeof raw !== "string") throw new SafeFetchError("bad-url");
  const text = raw.trim();
  if (text === "" || text.length > 2048) throw new SafeFetchError("bad-url");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SafeFetchError("bad-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SafeFetchError("bad-url");
  if (url.username !== "" || url.password !== "") throw new SafeFetchError("bad-url");
  if (url.port !== "" && url.port !== "80" && url.port !== "443") throw new SafeFetchError("bad-url");

  const host = url.hostname.replace(/\.+$/, "");
  if (host === "") throw new SafeFetchError("bad-url");
  if (host.startsWith("[")) {
    if (isBlockedAddress(host.slice(1, -1))) throw new SafeFetchError("blocked-address");
  } else if (/^[0-9.]+$/.test(host)) {
    // The URL parser has already turned 2130706433, 0x7f.1 and 017700000001 into dotted quads.
    if (isBlockedAddress(host)) throw new SafeFetchError("blocked-address");
  } else {
    if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new SafeFetchError("bad-url");
    if (!host.includes(".")) throw new SafeFetchError("bad-url"); // bare single-label names are intranet names
  }
  return url;
}

// ---------------------------------------------------------------------------------------------------------------------
// Transport

export type ResolvedAddress = { address: string; family: 4 | 6 };

type LookupCallback = (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void;
/** Shaped like the `lookup` option of net.connect / http.request. */
export type PinnedLookup = (hostname: string, options: { all?: boolean; family?: number | string; hints?: number }, callback: LookupCallback) => void;

export type RawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  /** Tear the connection down without reading the rest. */
  destroy(): void;
};

export type RequestInit = { url: URL; headers: Record<string, string>; lookup: PinnedLookup; signal: AbortSignal };
export type RequestFn = (init: RequestInit) => Promise<RawResponse>;

/** Default transport: node:http / node:https, one fresh connection per request (no shared agent, no keep-alive reuse). */
export const nodeRequest: RequestFn = ({ url, headers, lookup, signal }) =>
  new Promise<RawResponse>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const secure = url.protocol === "https:";
    const req = (secure ? https : http).request(
      {
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port === "" ? undefined : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { ...headers, connection: "close" },
        lookup: lookup as unknown as net.LookupFunction,
        agent: false,
        signal,
      },
      (res) => {
        res.on("error", () => {}); // a destroyed or aborted response must never become an uncaught exception
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res, destroy: () => res.destroy() });
      },
    );
    req.on("error", reject);
    req.end();
  });

function defaultLookup(host: string): Promise<ResolvedAddress[]> {
  return dns.promises.lookup(host, { all: true, verbatim: true }) as Promise<ResolvedAddress[]>;
}

function normHost(h: string): string {
  return h.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

function pinTo(host: string, addrs: ResolvedAddress[]): PinnedLookup {
  const want = normHost(host);
  return (hostname, options, callback) => {
    const opts = options ?? {}; // node always passes an object; be lenient anyway
    if (normHost(hostname) !== want) return callback(Object.assign(new Error("lookup refused"), { code: "ENOTFOUND" }), []);
    const family = Number(opts.family) || 0;
    const usable = family === 4 || family === 6 ? addrs.filter((a) => a.family === family) : addrs;
    if (usable.length === 0) return callback(Object.assign(new Error("lookup refused"), { code: "ENOTFOUND" }), []);
    if (opts.all) return callback(null, usable.map((a) => ({ address: a.address, family: a.family })));
    callback(null, usable[0].address, usable[0].family);
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// safeFetch

export type SafeFetchOptions = {
  maxBytes: number;
  onLimit?: "error" | "truncate";
  /** Total budget for the whole fetch, redirects included. Default 5000. */
  timeoutMs?: number;
  /** Default 3. */
  maxRedirects?: number;
  /** Tested against the media type (the Content-Type without parameters, lower-cased). */
  accept: RegExp;
  headers?: Record<string, string>;
  lookup?: (host: string) => Promise<ResolvedAddress[]>;
  request?: RequestFn;
};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const DROPPED_REQUEST_HEADERS = new Set(["cookie", "authorization", "proxy-authorization", "referer", "host", "user-agent", "accept-encoding", "connection"]);

function header(h: RawResponse["headers"], name: string): string | undefined {
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === name) return Array.isArray(v) ? v[0] : v;
  }
  return undefined;
}

async function resolveValidated(url: URL, lookup: (host: string) => Promise<ResolvedAddress[]>): Promise<ResolvedAddress[]> {
  const host = url.hostname;
  if (host.startsWith("[")) return [{ address: host.slice(1, -1), family: 6 }]; // literal, already vetted by parseSafeUrl
  if (net.isIPv4(host)) return [{ address: host, family: 4 }];
  const found = await lookup(host);
  if (!Array.isArray(found) || found.length === 0) throw new Error("no addresses"); // a plain error: reported as unreachable, never as a code
  for (const a of found) {
    const fam = net.isIP(a?.address);
    if (!fam || fam !== a.family || isBlockedAddress(a.address)) throw new SafeFetchError("blocked-address");
  }
  return found;
}

export async function safeFetch(rawUrl: string, o: SafeFetchOptions): Promise<{ finalUrl: string; status: number; contentType: string; body: Uint8Array }> {
  const timeoutMs = o.timeoutMs ?? 5000;
  const maxRedirects = o.maxRedirects ?? 3;
  const lookup = o.lookup ?? defaultLookup;
  const request = o.request ?? nodeRequest;
  const accept = new RegExp(o.accept.source, o.accept.flags.replace(/[gy]/g, ""));
  const truncate = o.onLimit === "truncate";

  const sent: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.headers ?? {})) if (!DROPPED_REQUEST_HEADERS.has(k.toLowerCase())) sent[k] = v;
  sent["User-Agent"] = "AtelierLinkPreview/1.0";
  sent["Accept-Encoding"] = "identity";

  const ac = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      ac.abort();
      reject(new SafeFetchError("timeout"));
    }, timeoutMs);
  });

  async function run() {
    let current = parseSafeUrl(rawUrl);
    for (let hop = 0; ; hop++) {
      const addrs = await resolveValidated(current, lookup);
      if (expired) throw new SafeFetchError("timeout");
      const res = await request({ url: current, headers: { ...sent }, lookup: pinTo(current.hostname, addrs), signal: ac.signal });
      if (expired) {
        res.destroy();
        throw new SafeFetchError("timeout");
      }

      if (REDIRECTS.has(res.status)) {
        res.destroy();
        if (hop >= maxRedirects) throw new SafeFetchError("too-many-redirects");
        const location = header(res.headers, "location");
        if (!location) throw new SafeFetchError("http-status", res.status);
        let next: string;
        try {
          next = new URL(location, current).href;
        } catch {
          throw new SafeFetchError("bad-url");
        }
        current = parseSafeUrl(next); // every hop is vetted afresh, then re-resolved at the top of the loop
        continue;
      }

      if (res.status < 200 || res.status >= 300) {
        res.destroy();
        throw new SafeFetchError("http-status", res.status);
      }
      const contentType = header(res.headers, "content-type") ?? "";
      if (!accept.test(contentType.split(";")[0].trim().toLowerCase())) {
        res.destroy();
        throw new SafeFetchError("bad-content-type");
      }
      const encoding = (header(res.headers, "content-encoding") ?? "").trim().toLowerCase();
      if (encoding !== "" && encoding !== "identity") {
        res.destroy();
        throw new SafeFetchError("bad-content-type");
      }
      const declared = Number(header(res.headers, "content-length"));
      if (!truncate && Number.isFinite(declared) && declared > o.maxBytes) {
        res.destroy();
        throw new SafeFetchError("too-large");
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for await (const chunk of res.body) {
          if (total + chunk.byteLength > o.maxBytes) {
            if (!truncate) throw new SafeFetchError("too-large");
            chunks.push(chunk.subarray(0, o.maxBytes - total));
            total = o.maxBytes;
            res.destroy();
            break;
          }
          chunks.push(chunk);
          total += chunk.byteLength;
        }
      } catch (e) {
        res.destroy();
        throw e;
      }
      const body = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) {
        body.set(c, at);
        at += c.byteLength;
      }
      return { finalUrl: current.href, status: res.status, contentType, body };
    }
  }

  const work = run();
  work.catch(() => {}); // if the deadline wins, a later failure of the abandoned work must not surface as unhandled
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
    ac.abort(); // tears down any socket still open, whatever the outcome
  }
}
