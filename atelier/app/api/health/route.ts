import pkg from "@/package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, version: pkg.version }, { headers: { "Cache-Control": "no-store" } });
}
