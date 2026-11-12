// A tiny in-memory stand-in for the parts of the Supabase query builder the Atelier routes use.
// It does NOT enforce row-level security (that is tested in SQL); routes must filter by owner
// themselves, and these tests prove they do.
type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "delete";

export type FakeDb = { tables: Record<string, Row[]> };

export function newDb(): FakeDb {
  return { tables: { boards: [], folders: [] } };
}

const DEFAULTS: Record<string, () => Row> = {
  boards: () => ({
    id: crypto.randomUUID(),
    folder_id: null,
    title: "Untitled",
    starred: false,
    thumbnail_asset_id: null,
    preview: [],
    last_opened_at: null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
  folders: () => ({
    id: crypto.randomUUID(),
    parent_id: null,
    sort: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
};

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: Op = "select";
  private payload: Row | Row[] | null = null;
  private filters: Array<(r: Row) => boolean> = [];
  private mode: "many" | "single" | "maybe" = "many";

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select() {
    return this; // keeps insert/update/delete as the operation: "returning"
  }
  insert(p: Row | Row[]) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private run(): { data: unknown; error: unknown } {
    const rows = (this.db.tables[this.table] ??= []);
    let out: Row[] = [];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      for (const p of list) {
        const row = { ...(DEFAULTS[this.table]?.() ?? {}), ...p };
        rows.push(row);
        out.push(row);
      }
    } else {
      out = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") {
        for (const r of out) Object.assign(r, this.payload, { updated_at: new Date().toISOString() });
      } else if (this.op === "delete") {
        this.db.tables[this.table] = rows.filter((r) => !out.includes(r));
      }
    }
    const copy = out.map((r) => structuredClone(r));
    if (this.mode === "many") return { data: copy, error: null };
    if (copy.length === 1) return { data: copy[0], error: null };
    if (this.mode === "maybe" && copy.length === 0) return { data: null, error: null };
    return { data: null, error: { code: "PGRST116", message: "no single row" } };
  }

  then<A, B>(
    ok?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
}

/** A server client as requireOwner() sees it: claims from getClaims, tables from `db`. */
export function fakeClient(db: FakeDb, claims: Record<string, unknown> | null) {
  return {
    auth: {
      getClaims: async () => (claims ? { data: { claims }, error: null } : { data: null, error: { message: "no session" } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null }) },
    },
    from: (table: string) => new Query(db, table),
  };
}
