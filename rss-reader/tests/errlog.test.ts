import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransient, problemSignature } from "@/lib/errlog";

class StatusError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

test("busy or unreachable services are transient", () => {
  // The two production log entries this was written for.
  assert.equal(
    isTransient(
      new Error(
        'Gemini generateContent failed (503): { "error": { "code": 503, "message": "This model is currently experiencing high demand." } }'
      )
    ),
    true
  );
  assert.equal(isTransient(new Error("Could not fetch URL (status 429)")), true);
  assert.equal(isTransient(new StatusError("quota", 429)), true);
  assert.equal(isTransient(Object.assign(new Error("x"), { name: "TimeoutError" })), true);
  assert.equal(isTransient(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } })), true);
});

test("real bugs are not transient", () => {
  assert.equal(
    isTransient(new TypeError("Cannot read properties of undefined (reading 'id')")),
    false
  );
  assert.equal(isTransient(new Error("Unknown argument `foo`")), false);
  assert.equal(isTransient(new StatusError("Not found", 404)), false);
  assert.equal(isTransient(null), false);
});

test("one signature per kind of problem, whatever the ids", () => {
  assert.equal(
    problemSignature("Video AI", "failed for cmvhd5p87002q8k73fhi0fit7 at https://a.b/c?d=1 (400)"),
    problemSignature("Video AI", "failed for cmzzz5p87002q8k73fhi0abcd at https://x.y/z (401)")
  );
});
