import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTitle } from "@/lib/dearrow";

test("DeArrow's best title wins when it's trusted and not the original", () => {
  const branding = {
    titles: [
      { title: "How I fixed my >iPhone battery", original: false, votes: 2, locked: false },
      { title: "You WON'T believe this", original: true, votes: 5, locked: false },
    ],
  };
  assert.equal(pickTitle(branding, "You WON'T believe this"), "How I fixed my iPhone battery");
});

test("no title when it's the original, downvoted, missing or the same", () => {
  assert.equal(pickTitle({ titles: [{ title: "Same", original: true, votes: 3 }] }, "x"), null);
  assert.equal(pickTitle({ titles: [{ title: "Bad", original: false, votes: -1 }] }, "x"), null);
  assert.equal(pickTitle({ titles: [{ title: "Ok", locked: true, votes: -1 }] }, "x"), "Ok");
  assert.equal(pickTitle({ titles: [] }, "x"), null);
  assert.equal(pickTitle(null, "x"), null);
  assert.equal(pickTitle({ titles: [{ title: "x", votes: 1 }] }, "x"), null);
});
