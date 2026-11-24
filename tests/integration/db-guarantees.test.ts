import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/platform/db";

/**
 * Verifies the raw-SQL parts of the migration that Prisma cannot express:
 * PostGIS location trigger + radius query, and the double-booking exclusion constraint.
 * (The reservation *service* is built in Phase 4; this proves the database-level guarantee it will rely on.)
 */
const tag = `g${Date.now()}`;
let orgId: string, userId: string, vehicleId: string, facId: string, spaceId: string;

const base = (over: { reference: string; startAt: Date; endAt: Date; blocksInventory?: boolean }) => ({
  userId, facilityId: facId, vehicleId, allocation: "SPACE" as const, spaceId, vehicleType: "SEDAN" as const,
  estimatedFeeCents: 10000, depositCents: 2000, graceMinutes: 15, policySnapshot: {}, blocksInventory: true,
  ...over,
});
const at = (h: number) => new Date(Date.UTC(2030, 0, 1, h));
let n = 0;
const ref = () => `T-${tag}-${n++}`;

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { name: `G-${tag}` } })).id;
  userId = (await db.user.create({ data: { email: `${tag}@test.example`, passwordHash: "x" } })).id;
  vehicleId = (await db.vehicle.create({ data: { userId, plateNumber: `AA-${tag}` } })).id;
  const f = await db.parkingFacility.create({
    data: { organizationId: orgId, name: `G-${tag}`, type: "MALL", address: "x", latitude: 8.9958, longitude: 38.7864 },
  });
  facId = f.id;
  const floor = await db.parkingFloor.create({ data: { facilityId: facId, name: "F1" } });
  const zone = await db.parkingZone.create({ data: { facilityId: facId, floorId: floor.id, name: "A" } });
  spaceId = (await db.parkingSpace.create({ data: { facilityId: facId, zoneId: zone.id, label: "A1" } })).id;
});

afterAll(async () => {
  await db.reservation.deleteMany({ where: { facilityId: facId } });
  await db.parkingFacility.deleteMany({ where: { id: facId } });
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.vehicle.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("PostGIS", () => {
  it("derives the geography column from latitude/longitude via trigger", async () => {
    const [r] = await db.$queryRaw<{ lng: number; lat: number }[]>`
      SELECT ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM "ParkingFacility" WHERE id = ${facId}`;
    expect(r!.lng).toBeCloseTo(38.7864, 4);
    expect(r!.lat).toBeCloseTo(8.9958, 4);
  });

  it("radius search uses the DESTINATION point and respects the radius (#27, #29, #31)", async () => {
    const q = (lat: number, lng: number, radius: number) =>
      db.$queryRaw<{ id: string; distance: number }[]>`
        SELECT id, ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance
        FROM "ParkingFacility"
        WHERE id = ${facId} AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})`;
    // destination ~100 m away → found at 500 m
    const near = await q(8.9958, 38.7874, 500);
    expect(near).toHaveLength(1);
    expect(near[0]!.distance).toBeGreaterThan(90);
    expect(near[0]!.distance).toBeLessThan(120);
    // destination ~5 km away (Meskel Square) → excluded at 1 km, included at 5 km+... check exclusion
    expect(await q(9.0107, 38.7612, 1000)).toHaveLength(0);
    expect(await q(9.0107, 38.7612, 5000)).toHaveLength(1);
  });

  it("has a GiST index on the location column", async () => {
    const idx = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'ParkingFacility' AND indexdef ILIKE '%gist%location%'`;
    expect(idx.length).toBe(1);
  });
});

describe("double-booking exclusion constraint (#1, #6)", () => {
  it("rejects an overlapping booking of the same space", async () => {
    await db.reservation.create({ data: base({ reference: ref(), startAt: at(10), endAt: at(12) }) });
    await expect(
      db.reservation.create({ data: base({ reference: ref(), startAt: at(11), endAt: at(13) }) }),
    ).rejects.toThrow();
  });

  it("allows back-to-back bookings ([start,end) is half-open)", async () => {
    await expect(
      db.reservation.create({ data: base({ reference: ref(), startAt: at(12), endAt: at(14) }) }),
    ).resolves.toBeDefined();
  });

  it("ignores rows that no longer block inventory (expired holds)", async () => {
    await expect(
      db.reservation.create({ data: base({ reference: ref(), startAt: at(10), endAt: at(12), blocksInventory: false }) }),
    ).resolves.toBeDefined();
  });

  it("exactly one of N concurrent identical bookings wins", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        db.reservation.create({ data: base({ reference: ref(), startAt: at(16), endAt: at(18) }) }),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(7);
  });

  it("rejects non-positive durations", async () => {
    await expect(
      db.reservation.create({ data: base({ reference: ref(), startAt: at(20), endAt: at(20) }) }),
    ).rejects.toThrow();
  });
});
