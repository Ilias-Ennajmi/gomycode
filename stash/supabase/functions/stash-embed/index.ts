// Deploy with verify_jwt = true.
import { userIdFromToken } from "../_shared/auth.ts";
import { rateLimitTake } from "../_shared/clients.ts";
import { embed } from "../_shared/embed.ts";
import { makeHandler } from "./handler.ts";

Deno.serve(makeHandler({ userId: userIdFromToken, rateLimitTake, embed }));
