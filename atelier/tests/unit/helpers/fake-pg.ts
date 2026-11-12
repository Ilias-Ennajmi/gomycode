// An in-memory stand-in for the PostgREST query builder, wide enough for the sync and asset routes:
// select (with exact head counts), insert, upsert, update, delete, eq/gt/gte/lt/lte/in, order, limit, single/maybeSingle.
// It mimics the parts of RLS Atelier relies on (rows are visible only to their owner, children through their board) so
// "someone else's board" tests are meaningful; the real policies are tested in supabase/tests/rls.sql.
type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "delete" | "upsert";
type Result = { data: unknown; error: unknown; count?: number | null };

export type FakePg = {
  tables: Record<string, Row[]>;
  /** Make the next operation on a table fail with this error. */
  failNext(table: string, error: { code?: string; message: string }): void;
  /** Number of queries run, per "table.op". */
  stats: Record<string, number>;
  client(claims: Record<string, unknown> | null): ReturnType<typeof makeClient>;
};

const TIMESTAMPED = new Set(["board_updates", "board_snapshots", "assets", "boards"]);
const OWNED = new Set(["boards", "assets", "folders"]);
const BY_BOARD = new Set(["board_updates", "board_snapshots", "asset_usages"]);

export function createFakePg(): FakePg {
  const seqs: Record<string, number> = {};
  const failures: Record<string, { code?: string; message: string }[]> = {};
  const pg: FakePg = {
    tables: { boards: [], assets: [], folders: [], board_updates: [], board_snapshots: [], asset_usages: [] },
    stats: {},
    failNext(table, error) {
      (failures[table] ??= []).push(error);
    },
    client(claims) {
      return makeClient(pg, claims, seqs, failures);
    },
  };
  return pg;
}

function makeClient(pg: FakePg, claims: Record<string, unknown> | null, seqs: Record<string, number>, failures: Record<string, { code?: string; message: string }[]>) {
  const sub = typeof claims?.sub === "string" ? claims.sub : null;
  const ownsBoard = (id: unknown) => pg.tables.boards.some((b) => b.id === id && b.owner_id === sub);
  const visible = (table: string, row: Row) => {
    if (OWNED.has(table)) return row.owner_id === sub;
    if (BY_BOARD.has(table)) return ownsBoard(row.board_id);
    return true;
  };

  class Query implements PromiseLike<Result> {
    private op: Op = "select";
    private payload: Row | Row[] | null = null;
    private filters: Array<(r: Row) => boolean> = [];
    private sort: { col: string; asc: boolean } | null = null;
    private max: number | null = null;
    private mode: "many" | "single" | "maybe" = "many";
    private countMode = false;
    private head = false;
    private onConflict = "id";
    constructor(private table: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.count) this.countMode = true;
      if (opts?.head) this.head = true;
      return this;
    }
    insert(p: Row | Row[]) {
      this.op = "insert";
      this.payload = p;
      return this;
    }
    upsert(p: Row | Row[], opts?: { onConflict?: string }) {
      this.op = "upsert";
      this.payload = p;
      if (opts?.onConflict) this.onConflict = opts.onConflict;
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
    eq(c: string, v: unknown) {
      this.filters.push((r) => r[c] === v);
      return this;
    }
    gt(c: string, v: unknown) {
      this.filters.push((r) => (r[c] as number | string) > (v as number | string));
      return this;
    }
    gte(c: string, v: unknown) {
      this.filters.push((r) => (r[c] as number | string) >= (v as number | string));
      return this;
    }
    lt(c: string, v: unknown) {
      this.filters.push((r) => (r[c] as number | string) < (v as number | string));
      return this;
    }
    lte(c: string, v: unknown) {
      this.filters.push((r) => (r[c] as number | string) <= (v as number | string));
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(r[c]));
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.sort = { col, asc: opts?.ascending !== false };
      return this;
    }
    limit(n: number) {
      this.max = n;
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

    private fill(p: Row): Row {
      const row: Row = { ...p };
      if (OWNED.has(this.table) && row.owner_id === undefined) row.owner_id = sub; // default auth.uid()
      if (this.table === "board_updates") row.seq = ++seqs.board_updates || (seqs.board_updates = 1);
      if (this.table === "board_snapshots" && row.id === undefined) row.id = crypto.randomUUID();
      if (TIMESTAMPED.has(this.table) && row.created_at === undefined) row.created_at = new Date().toISOString();
      return row;
    }

    private run(): Result {
      const key = `${this.table}.${this.op}`;
      pg.stats[key] = (pg.stats[key] ?? 0) + 1;
      const queued = failures[this.table]?.shift();
      if (queued) return { data: null, error: queued };
      if (!sub) return { data: null, error: { code: "42501", message: "permission denied" } };

      const rows = (pg.tables[this.table] ??= []);
      let out: Row[] = [];
      if (this.op === "insert" || this.op === "upsert") {
        for (const p of Array.isArray(this.payload) ? this.payload : [this.payload!]) {
          const row = this.fill(p);
          if (!visible(this.table, row)) return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
          const existing = rows.find((r) => r[this.onConflict] !== undefined && r[this.onConflict] === row[this.onConflict]);
          if (existing) {
            if (this.op === "insert" || !visible(this.table, existing)) {
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            Object.assign(existing, row);
            out.push(existing);
          } else {
            rows.push(row);
            out.push(row);
          }
        }
      } else {
        out = rows.filter((r) => visible(this.table, r) && this.filters.every((f) => f(r)));
        if (this.op === "update") for (const r of out) Object.assign(r, this.payload);
        if (this.op === "delete") pg.tables[this.table] = rows.filter((r) => !out.includes(r));
      }
      if (this.sort) {
        const { col, asc } = this.sort;
        out = [...out].sort((a, b) => ((a[col] as number) < (b[col] as number) ? -1 : (a[col] as number) > (b[col] as number) ? 1 : 0) * (asc ? 1 : -1));
      }
      const total = out.length;
      if (this.max !== null) out = out.slice(0, this.max);
      const copy = out.map((r) => structuredClone(r));
      if (this.head) return { data: null, error: null, count: total };
      const count = this.countMode ? total : null;
      if (this.mode === "many") return { data: copy, error: null, count };
      if (copy.length === 1) return { data: copy[0], error: null, count };
      if (this.mode === "maybe" && copy.length === 0) return { data: null, error: null, count };
      return { data: null, error: { code: "PGRST116", message: "no single row" }, count };
    }

    then<A, B>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve()
        .then(() => this.run())
        .then(ok, bad);
    }
  }

  return {
    auth: {
      getClaims: async () => (claims ? { data: { claims }, error: null } : { data: null, error: { message: "no session" } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null }) },
    },
    from: (table: string) => new Query(table),
  };
}
