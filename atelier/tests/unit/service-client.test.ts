import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/supabase/service";

const ROOT = resolve(__dirname, "../..");

describe("createServiceClient", () => {
  it("is null without the URL or without the service key", () => {
    expect(createServiceClient({})).toBeNull();
    expect(createServiceClient({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(createServiceClient({ SUPABASE_SERVICE_ROLE_KEY: "k" })).toBeNull();
  });

  it("builds a client for the atelier schema that keeps no session", () => {
    const c = createServiceClient({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" });
    expect(c).not.toBeNull();
    expect(typeof c!.from).toBe("function");
  });

  it("never reads the key from a NEXT_PUBLIC_ variable", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/service.ts"), "utf8");
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
  });
});

// ---- the service client can never reach a browser bundle ------------------------------------------------------------

// Top-level folders that hold no application code (the top-level `supabase` is SQL; lib/supabase is code and IS scanned).
const SKIP_TOP = new Set(["node_modules", ".next", "tests", "e2e", "scripts", "bench", "docs", "public", "supabase"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if ((dir === ROOT && SKIP_TOP.has(name)) || name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(from: string, spec: string, all: Set<string>): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (all.has(candidate)) return candidate;
  }
  return null;
}

describe("the service-role client stays on the server", () => {
  const files = sourceFiles(ROOT);
  const all = new Set(files);
  const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const importsOf = (f: string) => {
    const out: string[] = [];
    for (const m of text.get(f)!.matchAll(IMPORT_RE)) {
      const hit = resolveImport(f, m[1] ?? m[2], all);
      if (hit) out.push(hit);
    }
    return out;
  };

  it("the file itself starts with the server-only guard", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/service.ts"), "utf8");
    const firstImport = src.split("\n").find((l) => l.startsWith("import "));
    expect(firstImport).toBe('import "server-only";');
  });

  it("no module a Client Component imports (directly or through others) reaches it or the Supabase share store", () => {
    const forbidden = new Set([join(ROOT, "lib/supabase/service.ts"), join(ROOT, "lib/server/share-store-supabase.ts"), join(ROOT, "lib/server/share-store.ts")]);
    const clientRoots = files.filter((f) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text.get(f)!));
    expect(clientRoots.length).toBeGreaterThan(5); // the scan itself works
    const offenders: string[] = [];
    for (const root of clientRoots) {
      const seen = new Set<string>([root]);
      const stack = [root];
      while (stack.length) {
        const f = stack.pop()!;
        for (const next of importsOf(f)) {
          if (forbidden.has(next)) offenders.push(`${relative(ROOT, root)} -> ${relative(ROOT, f)} -> ${relative(ROOT, next)}`);
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only server code (routes, lib/server, proxy) imports it", () => {
    const importers = files.filter((f) => importsOf(f).includes(join(ROOT, "lib/supabase/service.ts"))).map((f) => relative(ROOT, f));
    for (const f of importers) expect(f, f).toMatch(/^(app\/api\/|lib\/server\/|proxy\.ts)/);
  });
});
