import { NextResponse } from "next/server";

// A request whose body isn't JSON (often one cut off when a page closed mid-save) is the
// client's problem: a 400, not a server error worth an alert.

export class BadRequest extends Error {}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new BadRequest("The request body isn't valid JSON");
  }
}

export function badRequest(error: BadRequest) {
  return NextResponse.json({ error: error.message }, { status: 400 });
}
