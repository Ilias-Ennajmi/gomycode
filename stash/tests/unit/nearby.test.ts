import { describe, expect, it } from "vitest";
import { matchNearby, nearestPlace } from "@/lib/nearby";
import type { PlacePin } from "@/lib/places";

const HERE = { lat: 33.5731, lng: -7.5898 };
// ~111 m per 0.001° of latitude.
const pin = (id: string, saveId: string, dLat: number): PlacePin => ({
  id,
  saveId,
  name: id,
  address: null,
  lat: HERE.lat + dLat,
  lng: HERE.lng,
});

describe("matchNearby", () => {
  const places = [pin("cafe", "s1", 0.003), pin("far", "s2", 0.02), pin("shop", "s3", 0.001), pin("cafe-2", "s1", 0.0035)];

  it("keeps reminders whose place is within 500 m, nearest first, one hit per reminder", () => {
    const hits = matchNearby(
      [
        { id: "r1", saveId: "s1" },
        { id: "r2", saveId: "s2" },
        { id: "r3", saveId: "s3" },
      ],
      places,
      HERE,
    );
    expect(hits.map((h) => [h.reminderId, h.place.id])).toEqual([
      ["r3", "shop"],
      ["r1", "cafe"],
    ]);
    expect(hits[1].distance).toBeGreaterThan(300);
    expect(hits[1].distance).toBeLessThan(500);
  });

  it("finds nothing without places or outside the radius", () => {
    expect(matchNearby([{ id: "r", saveId: "s9" }], places, HERE)).toEqual([]);
    expect(matchNearby([{ id: "r", saveId: "s2" }], places, HERE)).toEqual([]);
    expect(matchNearby([{ id: "r", saveId: "s2" }], places, HERE, 3000)).toHaveLength(1);
  });
});

describe("nearestPlace", () => {
  it("returns the closest saved place within the radius", () => {
    expect(nearestPlace([pin("a", "s1", 0.005), pin("b", "s2", 0.002)], HERE, 1000)?.place.id).toBe("b");
    expect(nearestPlace([pin("a", "s1", 0.05)], HERE, 1000)).toBeNull();
  });
});
