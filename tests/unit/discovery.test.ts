import { describe, expect, it } from "vitest";
import { estimateFeeCents, selectRule, type PricingRuleLike } from "@/modules/pricing/calculate";
import { isOpenForWindow } from "@/modules/discovery/hours";
import { discoverQuery } from "@/modules/discovery/schemas";
import { haversineMeters } from "@/modules/geo/routing";
import { escapeLike } from "@/modules/geo/geocoding";

const rule = (o: Partial<PricingRuleLike> = {}): PricingRuleLike => ({
  vehicleType: null, unit: "HOURLY", firstUnitCents: 3000, additionalUnitCents: 2000, minimumChargeCents: 0,
  dailyCapCents: null, rounding: "UP_TO_HOUR", priority: 0, active: true, ...o,
});

describe("fee estimate (integer santim)", () => {
  it("charges the first hour, then additional hours", () => {
    expect(estimateFeeCents(rule(), 60)).toBe(3000);
    expect(estimateFeeCents(rule(), 61)).toBe(5000); // rounds up to 2h
    expect(estimateFeeCents(rule(), 180)).toBe(7000);
  });
  it("rounds up to the configured step and prorates", () => {
    expect(estimateFeeCents(rule({ rounding: "UP_TO_30_MIN" }), 70)).toBe(3000 + 1000); // 90 billable
    expect(estimateFeeCents(rule({ rounding: "UP_TO_15_MIN" }), 61)).toBe(3000 + 500); // 75 billable
  });
  it("applies minimum charge and daily cap per started 24h", () => {
    expect(estimateFeeCents(rule({ minimumChargeCents: 4000 }), 30)).toBe(4000);
    expect(estimateFeeCents(rule({ dailyCapCents: 10000 }), 24 * 60)).toBe(10000);
    expect(estimateFeeCents(rule({ dailyCapCents: 10000 }), 24 * 60 + 60)).toBe(13000);
  });
  it("supports daily pricing and never returns fractions", () => {
    expect(estimateFeeCents(rule({ unit: "DAILY", firstUnitCents: 20000, additionalUnitCents: 15000 }), 3 * 1440 - 1)).toBe(50000);
    expect(Number.isInteger(estimateFeeCents(rule({ rounding: "NONE", additionalUnitCents: 1001 }), 77))).toBe(true);
    expect(estimateFeeCents(rule(), 0)).toBe(0);
  });
  it("selects a vehicle-specific rule over a generic one, then by priority", () => {
    const generic = rule({ priority: 9, firstUnitCents: 1 });
    const suv = rule({ vehicleType: "SUV", firstUnitCents: 2 });
    expect(selectRule([generic, suv], "SUV")?.firstUnitCents).toBe(2);
    expect(selectRule([generic, suv], "SEDAN")?.firstUnitCents).toBe(1);
    expect(selectRule([rule({ active: false })], "SEDAN")).toBeNull();
    expect(selectRule([suv], "SEDAN")).toBeNull();
  });
});

describe("opening hours (local Addis time = UTC+3)", () => {
  // 2026-11-23 is a Monday (dow 1). 08:00 local = 05:00Z.
  const mon = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 23, h - 3, m));
  const hours = [1, 2].map((d) => ({ dayOfWeek: d, opensMinute: 8 * 60, closesMinute: 20 * 60 }));
  it("requires the whole stay inside opening hours", () => {
    expect(isOpenForWindow(false, hours, mon(9), mon(12))).toBe(true);
    expect(isOpenForWindow(false, hours, mon(7), mon(12))).toBe(false);
    expect(isOpenForWindow(false, hours, mon(19), mon(21))).toBe(false);
  });
  it("handles stays crossing midnight and days without hours", () => {
    expect(isOpenForWindow(false, hours, mon(18), new Date(mon(18).getTime() + 8 * 3600_000))).toBe(false);
    const wed = new Date(Date.UTC(2026, 10, 25, 6)); // Wednesday: no row
    expect(isOpenForWindow(false, hours, wed, new Date(wed.getTime() + 3600_000))).toBe(false);
  });
  it("24h facilities are always open; 1440 means end of day", () => {
    expect(isOpenForWindow(true, [], mon(1), mon(23))).toBe(true);
    const allDay = [{ dayOfWeek: 1, opensMinute: 0, closesMinute: 1440 }];
    expect(isOpenForWindow(false, allDay, mon(10), mon(23, 59))).toBe(true);
  });
});

describe("discover query contract", () => {
  const base = { lat: "9.01", lng: "38.76" };
  it("accepts a destination and applies defaults", () => {
    const q = discoverQuery.parse(base);
    expect(q).toMatchObject({ radius: 1000, durationMinutes: 120, vehicleType: "SEDAN", sort: "distance", showUnavailable: false, features: [] });
  });
  it("rejects coordinates outside Ethiopia, swapped lat/lng and odd radii", () => {
    expect(discoverQuery.safeParse({ lat: "51.5", lng: "-0.1" }).success).toBe(false);
    expect(discoverQuery.safeParse({ lat: "38.76", lng: "9.01" }).success).toBe(false);
    expect(discoverQuery.safeParse({ ...base, radius: "750" }).success).toBe(false);
    expect(discoverQuery.safeParse({ ...base, radius: "5000" }).success).toBe(true);
    expect(discoverQuery.safeParse({ ...base, durationMinutes: "5" }).success).toBe(false);
  });
  it("has no driver-location input: such params are ignored", () => {
    const q = discoverQuery.parse({ ...base, driverLat: "9.5", driverLng: "38.9", userLocation: "9,38" });
    expect(Object.keys(q).some((k) => /driver|user/i.test(k))).toBe(false);
  });
  it("parses filters", () => {
    const q = discoverQuery.parse({ ...base, covered: "true", features: "CCTV, EV_CHARGING", maxPriceCents: "9000" });
    expect(q).toMatchObject({ covered: true, features: ["CCTV", "EV_CHARGING"], maxPriceCents: 9000 });
  });
});

describe("geo helpers", () => {
  it("haversine is about right (Meskel Sq -> Bole airport ~ 5.3 km)", () => {
    const d = haversineMeters({ latitude: 9.0107, longitude: 38.7612 }, { latitude: 8.9779, longitude: 38.7993 });
    expect(d).toBeGreaterThan(5000);
    expect(d).toBeLessThan(6000);
  });
  it("escapes LIKE wildcards", () => {
    const bs = String.fromCharCode(92);
    expect(escapeLike(`100%_x${bs}`)).toBe(`100${bs}%${bs}_x${bs}${bs}`);
  });
});
