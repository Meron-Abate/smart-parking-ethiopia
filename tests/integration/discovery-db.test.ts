import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/platform/db";
import { discover } from "@/modules/discovery/service";
import { discoverQuery } from "@/modules/discovery/schemas";
import { geocoder } from "@/modules/geo";
import { loadLandmarks } from "../../prisma/landmarks";

// A point well away from the dev seed data (~20+ km from central Addis) so results are isolated.
const D = { lat: 9.3, lng: 39.1 };
const tag = `d${Date.now()}`;
// ~1 degree latitude = 111 km, so 0.001 deg ~ 111 m
const at = (dLat: number) => ({ latitude: D.lat + dLat, longitude: D.lng });
const NOW = new Date("2026-11-23T06:00:00Z"); // Monday 09:00 local
const ARRIVE = new Date("2026-11-23T08:00:00Z"); // 11:00 local
const q = (over: Record<string, string> = {}) =>
  discoverQuery.parse({ lat: String(D.lat), lng: String(D.lng), arrivalAt: ARRIVE.toISOString(), durationMinutes: "120", radius: "2000", ...over });

let orgId: string, userId: string, vehicleId: string;
const created: string[] = [];

async function facility(name: string, over: Record<string, unknown> = {}) {
  const f = await db.parkingFacility.create({
    data: {
      organizationId: orgId, name: `${name}-${tag}`, type: "MALL", status: "APPROVED", address: "Test", is24Hours: true,
      latitude: D.lat, longitude: D.lng, totalCapacity: 5, inventoryModel: "CAPACITY_BASED",
      reservationPolicy: { create: {} }, cancellationPolicy: { create: {} },
      pricingRules: { create: { firstUnitCents: 3000, additionalUnitCents: 2000 } },
      ...over,
    },
  });
  created.push(f.id);
  return f;
}
const book = (facilityId: string, spaceId: string | null, startAt: Date, endAt: Date) =>
  db.reservation.create({
    data: {
      reference: `T${Math.random().toString(36).slice(2, 10)}`, userId, facilityId, vehicleId, vehicleType: "SEDAN",
      allocation: spaceId ? "SPACE" : "CAPACITY", spaceId, status: "CONFIRMED", startAt, endAt, blocksInventory: true,
      estimatedFeeCents: 1, depositCents: 1, graceMinutes: 15, policySnapshot: {},
    },
  });

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `Org-${tag}`, status: "ACTIVE" } });
  orgId = org.id;
  const u = await db.user.create({ data: { email: `u.${tag}@test.example`, passwordHash: "x", role: "DRIVER" } });
  userId = u.id;
  vehicleId = (await db.vehicle.create({ data: { userId, plateNumber: `AA${tag}`, type: "SEDAN" } })).id;
  await loadLandmarks(db);
});

afterAll(async () => {
  await db.reservation.deleteMany({ where: { facilityId: { in: created } } });
  await db.parkingFacility.deleteMany({ where: { id: { in: created } } });
  await db.vehicle.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
  await db.organization.delete({ where: { id: orgId } });
});

describe("radius discovery (PostGIS, destination-centred)", () => {
  it("returns only approved facilities within the radius, nearest first", async () => {
    const near = await facility("near", at(0.0009)); // ~100 m
    const mid = await facility("mid", at(0.009)); // ~1 km
    const far = await facility("far", at(0.054)); // ~6 km
    const pending = await facility("pending", { ...at(0.0005), status: "PENDING_APPROVAL" });
    const suspended = await facility("susp", { ...at(0.0004), status: "SUSPENDED" });

    const r2 = await discover(q({ radius: "2000" }), NOW);
    const ids = r2.facilities.map((f) => f.id);
    expect(ids).toEqual([near.id, mid.id]);
    expect(ids).not.toContain(far.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(suspended.id);
    expect(r2.facilities[0]!.distanceMeters).toBeGreaterThan(80);
    expect(r2.facilities[0]!.distanceMeters).toBeLessThan(130);

    // radius options widen/narrow the set
    expect((await discover(q({ radius: "500" }), NOW)).facilities.map((f) => f.id)).toEqual([near.id]);
    expect((await discover(q({ radius: "5000" }), NOW)).facilities.map((f) => f.id)).toEqual([near.id, mid.id]);
    expect(far.id).toBeTruthy();
  });

  it("centres on the destination: moving the destination moves the results (driver position is not an input)", async () => {
    const a = await facility("anchorA", at(0.2));
    const other = { lat: String(D.lat + 0.2), lng: String(D.lng) };
    const res = await discover(q({ ...other, radius: "500" }), NOW);
    expect(res.facilities.map((f) => f.id)).toEqual([a.id]);
    expect(res.meta.destination).toMatchObject({ latitude: D.lat + 0.2 });
  });
});

describe("availability for the requested window", () => {
  it("capacity-based: subtracts overlapping bookings, ignores non-overlapping ones", async () => {
    const f = await facility("cap", { ...at(-0.0009), totalCapacity: 3 });
    await book(f.id, null, ARRIVE, new Date(ARRIVE.getTime() + 3600_000)); // overlaps
    await book(f.id, null, new Date(ARRIVE.getTime() + 2 * 3600_000), new Date(ARRIVE.getTime() + 3 * 3600_000)); // starts exactly at window end: no overlap
    const hit = (await discover(q({ radius: "500" }), NOW)).facilities.find((x) => x.id === f.id)!;
    expect(hit.availableUnits).toBe(2);
    expect(hit.status).toBe("LIMITED"); // <= max(3, 15%)
  });

  it("individual spaces: counts free, compatible spaces; a booked or maintenance space is excluded", async () => {
    const f = await facility("ind", { ...at(-0.0004), inventoryModel: "INDIVIDUAL_SPACES", totalCapacity: 4 });
    const floor = await db.parkingFloor.create({ data: { facilityId: f.id, name: "G" } });
    const zone = await db.parkingZone.create({ data: { facilityId: f.id, floorId: floor.id, name: "Z" } });
    const mk = (label: string, o: object = {}) =>
      db.parkingSpace.create({ data: { facilityId: f.id, zoneId: zone.id, label, vehicleTypes: ["SEDAN"], ...o } });
    const [s1, s2, s3] = [await mk("A1"), await mk("A2"), await mk("A3")];
    await mk("A4", { vehicleTypes: ["MOTORCYCLE"] }); // wrong vehicle type
    await mk("A5", { status: "MAINTENANCE" });
    await mk("A6", { vehicleTypes: ["MOTORCYCLE"] });
    await book(f.id, s1.id, ARRIVE, new Date(ARRIVE.getTime() + 3600_000));
    await db.maintenanceRecord.create({ data: { facilityId: f.id, spaceId: s2.id, startAt: ARRIVE, endAt: new Date(ARRIVE.getTime() + 600_000) } });

    let hit = (await discover(q({ radius: "500" }), NOW)).facilities.find((x) => x.id === f.id)!;
    expect(hit.availableUnits).toBe(1); // only A3
    // a motorcycle sees only the motorcycle spaces (A4, A6)
    hit = (await discover(q({ radius: "500", vehicleType: "MOTORCYCLE" }), NOW)).facilities.find((x) => x.id === f.id)!;
    expect(hit.availableUnits).toBe(2);
  });

  it("FULL facilities are hidden by default and shown (after bookable ones) when requested", async () => {
    const full = await facility("full", { ...at(0.0003), totalCapacity: 1 });
    await book(full.id, null, ARRIVE, new Date(ARRIVE.getTime() + 3600_000));
    const hidden = await discover(q({ radius: "500" }), NOW);
    expect(hidden.facilities.find((x) => x.id === full.id)).toBeUndefined();
    expect(hidden.meta.hiddenUnavailable).toBeGreaterThanOrEqual(1);
    const shown = await discover(q({ radius: "500", showUnavailable: "true" }), NOW);
    const row = shown.facilities.find((x) => x.id === full.id)!;
    expect(row).toMatchObject({ status: "FULL", bookable: false, availableUnits: 0 });
    const firstUnbookable = shown.facilities.findIndex((x) => !x.bookable);
    expect(shown.facilities.slice(firstUnbookable).every((x) => !x.bookable)).toBe(true);
  });

  it("closed outside opening hours; open when the whole stay fits", async () => {
    const f = await facility("hours", {
      ...at(0.0002), is24Hours: false,
      hours: { create: [{ dayOfWeek: 1, opensMinute: 8 * 60, closesMinute: 12 * 60 }] }, // Mon 08:00-12:00 local
    });
    // 11:00-13:00 local does not fit
    const closed = (await discover(q({ radius: "500", showUnavailable: "true" }), NOW)).facilities.find((x) => x.id === f.id)!;
    expect(closed.status).toBe("CLOSED");
    // 09:30-11:30 local does
    const ok = (await discover(q({ radius: "500", arrivalAt: "2026-11-23T06:30:00Z" }), NOW)).facilities.find((x) => x.id === f.id)!;
    expect(ok.bookable).toBe(true);
    expect(ok.hoursToday).toBe("08:00–12:00");
  });

  it("respects the facility's booking policy (duration and advance window)", async () => {
    const f = await facility("policy", { ...at(0.0006), reservationPolicy: { create: { minDurationMinutes: 60, maxDurationMinutes: 180, minAdvanceMinutes: 30, maxAdvanceDays: 2 } } });
    const get = async (o: Record<string, string>) =>
      (await discover(q({ radius: "500", showUnavailable: "true", ...o }), NOW)).facilities.find((x) => x.id === f.id)!;
    expect((await get({ durationMinutes: "240" })).status).toBe("NOT_BOOKABLE");
    expect((await get({ durationMinutes: "30" })).status).toBe("NOT_BOOKABLE");
    expect((await get({ arrivalAt: "2026-11-23T06:10:00Z" })).reason).toMatch(/ahead/); // 10 min ahead < 30
    expect((await get({ arrivalAt: "2026-11-27T06:00:00Z" })).reason).toMatch(/ahead/); // 4 days > 2
    expect((await get({})).bookable).toBe(true);
  });

  it("rejects an arrival in the past", async () => {
    await expect(discover(q({ arrivalAt: "2026-11-23T00:00:00Z" }), NOW)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("price, filters and sorting", () => {
  it("estimates the fee server-side for the stay and sorts by price / availability", async () => {
    const cheap = await facility("cheap", { ...at(0.0012), totalCapacity: 50, pricingRules: { create: { firstUnitCents: 1000, additionalUnitCents: 1000 } } });
    const pricey = await facility("pricey", { ...at(0.0011), totalCapacity: 9, pricingRules: { create: { firstUnitCents: 9000, additionalUnitCents: 9000 } } });
    const byPrice = (await discover(q({ radius: "500", sort: "price" }), NOW)).facilities;
    expect(byPrice.find((x) => x.id === cheap.id)!.estimatedFeeCents).toBe(2000); // 2h
    expect(byPrice.find((x) => x.id === pricey.id)!.estimatedFeeCents).toBe(18000);
    const fees = byPrice.map((x) => x.estimatedFeeCents!);
    expect(fees).toEqual([...fees].sort((a, b) => a - b));
    const byAvail = (await discover(q({ radius: "500", sort: "availability" }), NOW)).facilities;
    const units = byAvail.map((x) => x.availableUnits!);
    expect(units).toEqual([...units].sort((a, b) => b - a));
    // max price filter
    const capped = await discover(q({ radius: "500", maxPriceCents: "5000" }), NOW);
    expect(capped.facilities.every((x) => x.estimatedFeeCents! <= 5000)).toBe(true);
    expect(capped.facilities.some((x) => x.id === cheap.id)).toBe(true);
    expect(capped.facilities.some((x) => x.id === pricey.id)).toBe(false);
  });

  it("filters by covered / 24h / features", async () => {
    const f = await facility("feat", {
      ...at(0.0013), isCovered: true, features: { create: [{ key: "CCTV" }, { key: "EV_CHARGING" }] },
    });
    const covered = await discover(q({ radius: "500", covered: "true" }), NOW);
    expect(covered.facilities.every((x) => x.isCovered)).toBe(true);
    expect(covered.facilities.some((x) => x.id === f.id)).toBe(true);
    const both = await discover(q({ radius: "500", features: "CCTV,EV_CHARGING" }), NOW);
    expect(both.facilities.map((x) => x.id)).toEqual([f.id]);
    expect((await discover(q({ radius: "500", features: "CCTV,CAR_WASH" }), NOW)).facilities.length).toBe(0);
  });

  it("facilities with no applicable price are flagged, not silently priced", async () => {
    const f = await facility("noprice", { ...at(0.0014), pricingRules: { create: { firstUnitCents: 1, additionalUnitCents: 1, vehicleType: "TRUCK" } } });
    const row = (await discover(q({ radius: "500", showUnavailable: "true" }), NOW)).facilities.find((x) => x.id === f.id)!;
    expect(row.status).toBe("NO_PRICE");
    expect(row.estimatedFeeCents).toBeNull();
  });

  it("reports a walking estimate labelled as an estimate", async () => {
    const res = await discover(q({ radius: "500" }), NOW);
    expect(res.facilities[0]!.walk.source).toBe("estimate");
    expect(res.facilities[0]!.walk.minutes).toBeGreaterThanOrEqual(1);
  });
});

describe("destination search (seeded geocoder)", () => {
  it("finds landmarks by name, alias and small typos", async () => {
    expect((await geocoder.search("Meskel")).map((p) => p.name)).toContain("Meskel Square");
    expect((await geocoder.search("Merkato")).map((p) => p.name)).toContain("Mercato");
    expect((await geocoder.search("Meskle Square")).map((p) => p.name)).toContain("Meskel Square");
    expect((await geocoder.search("edna")).map((p) => p.name)).toContain("Edna Mall");
  });
  it("returns coordinates inside Ethiopia and nothing for gibberish, short or wildcard input", async () => {
    const [hit] = await geocoder.search("Bole International Airport");
    expect(hit!.latitude).toBeGreaterThan(8);
    expect(hit!.latitude).toBeLessThan(10);
    expect(await geocoder.search("zzqxjv")).toEqual([]);
    expect(await geocoder.search("a")).toEqual([]);
    expect(await geocoder.search("%%")).toEqual([]);
  });
  it("includes approved facilities, not pending ones", async () => {
    const ok = await facility("Searchable Lot");
    const pend = await facility("Searchable Pending", { status: "PENDING_APPROVAL" });
    const names = (await geocoder.search(`Searchable Lot-${tag}`)).map((p) => p.id);
    expect(names).toContain(ok.id);
    expect(names).not.toContain(pend.id);
  });
});
