import { Prisma } from "@prisma/client";

/**
 * The Postgres schema the app's tables live in: "rss" on Supabase (from ?schema= in
 * DATABASE_URL), "public" locally. Raw SQL must name it, because Supabase's pooler doesn't
 * keep a search_path.
 */
function databaseSchema() {
  try {
    const schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
    if (schema && /^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) return schema;
  } catch {
    // Not a URL: fall through to the default.
  }
  return "public";
}

const SCHEMA = databaseSchema();

/** A table or function name for raw SQL, qualified with the app's schema. */
export function sqlName(name: string) {
  return Prisma.raw(`"${SCHEMA}"."${name}"`);
}
