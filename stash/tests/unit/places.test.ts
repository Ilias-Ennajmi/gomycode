import { describe, expect, it } from "vitest";
import { distanceM, formatDistance, sortByDistance } from "@/lib/places";

const CASA = { lat: 33.5731, lng: -7.5898 };
const RABAT = { lat: 34.0209, lng: -6.8416 };

describe("distanceM", () => {
  it("is zero for the same point and symmetric", () => {
    expect(distanceM(CASA, CASA)).toBe(0);
    expect(distanceM(CASA, RABAT)).toBeCloseTo(distanceM(RABAT, CASA), 6);
  });

  it("matches the known Casablanca–Rabat distance (~87 km)", () => {
    const km = distanceM(CASA, RABAT) / 1000;
    expect(km).toBeGreaterThan(84);
    expect(km).toBeLessThan(90);
  });

  it("measures short hops in metres", () => {
    const m = distanceM(CASA, { lat: CASA.lat + 0.0045, lng: CASA.lng });
    expect(m).toBeGreaterThan(490);
    expect(m).toBeLessThan(510);
  });
});

describe("sortByDistance / formatDistance", () => {
  it("puts the nearest first", () => {
    const sorted = sortByDistance([{ ...RABAT, n: "r" }, { lat: 33.58, lng: -7.59, n: "near" }], CASA);
    expect(sorted.map((p) => p.n)).toEqual(["near", "r"]);
  });

  it("formats metres and kilometres", () => {
    expect(formatDistance(3)).toBe("10 m");
    expect(formatDistance(432)).toBe("430 m");
    expect(formatDistance(1500)).toBe("1.5 km");
    expect(formatDistance(87000)).toBe("87 km");
  });
});
