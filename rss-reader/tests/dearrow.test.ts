import { test } from "node:test";
import assert from "node:assert/strict";
import { brandingDue, pickTitle } from "@/lib/dearrow";

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

test("a new video is asked about every 6 hours, an older one every 2 days, none after 14", () => {
  const now = Date.now();
  const h = 3_600_000;
  const ago = (hours: number) => new Date(now - hours * h);
  assert.equal(brandingDue(ago(1), null, now), true);
  assert.equal(brandingDue(ago(20), ago(3), now), false);
  assert.equal(brandingDue(ago(20), ago(7), now), true);
  assert.equal(brandingDue(ago(5 * 24), ago(24), now), false);
  assert.equal(brandingDue(ago(5 * 24), ago(49), now), true);
  assert.equal(brandingDue(ago(15 * 24), null, now), false);
});
