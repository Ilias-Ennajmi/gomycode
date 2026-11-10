// stash-embed: the phone turns a search query into a 384-number vector. Contract 0007 §4.2.
// Deployed with verify_jwt = true; the function still checks the token itself (so a wrong deploy
// setting cannot open it) and takes the user id from the verified claims, never from the body.

import { cleanInputs, embedResponse } from "../_shared/embed.ts";
import { bearer, CORS, fail, HttpError, json, logFailure, readJson } from "../_shared/http.ts";

export type Deps = {
  /** The signed-in user's id for a valid access token, else null. */
  userId(token: string): Promise<string | null>;
  rateLimitTake(subject: string, bucket: string, max: number, windowS: number): Promise<boolean>;
  embed(inputs: string[], maxChars: number): Promise<number[][]>;
};

export function makeHandler(deps: Deps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (req.method !== "POST") return fail(405, "method_not_allowed", CORS);
      const token = bearer(req);
      const uid = token ? await deps.userId(token) : null;
      if (!uid) return fail(401, "unauthorized", CORS);
      const body = await readJson(req, 16 * 1024);
      const inputs = cleanInputs(body.input, 4, true);
      if (!inputs) return fail(400, "bad_request", CORS);
      if (!(await deps.rateLimitTake(`u:${uid}`, "embed", 60, 60))) return fail(429, "rate_limited", CORS);
      return json(embedResponse(await deps.embed(inputs, 1000)), 200, CORS);
    } catch (e) {
      logFailure("stash-embed", e);
      return e instanceof HttpError ? fail(e.status, e.code, CORS) : fail(500, "internal", CORS);
    }
  };
}
