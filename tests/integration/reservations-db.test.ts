import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/platform/db";
import {
  cancelReservation, confirmExtension, confirmReservation, createReservation, getMyReservation, listMyReservations,
  quoteReservation, requestExtension, sweep,
} from "@/modules/reservations/service";
import { createReservationSchema } from "@/modules/reservations/schemas";
import { addVehicle, removeVehicle } from "@/modules/vehicles/service";
import { vehicleSchema } from "@/modules/vehicles/schemas";
import { discover } from "@/modules/discovery/service";
import { discoverQuery } from "@/modules/discovery/schemas";

const tag = `r${Date.now()}`;
const NOW = new Date("2026-11-23T06:00:00Z"); // Monday 09:00 Addis
const T = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 23, h, m)); // UTC clock on the test day
const at = (h: number, m = 0) => T(h, m).toISOString();
const MIN = 60_000;

let orgId: string;
const facilityIds: string[] = [];
const userIds: string[] = [];

interface Driver { actor: { id: string; role: string }; vehicleId: string }
async function driver(n: string, type: "SEDAN" | "MOTORCYCLE" = "SEDAN"): Promise<Driver> {
  const u = await db.user.create({ data: { email: `${n}.${tag}@test.example`, passwordHash: "x", role: "DRIVER" } });
  userIds.push(u.id);
  const v = await addVehicle(u.id, vehicleSchema.parse({ plateNumber: `T${tag.slice(-5)}${n}`.slice(0, 15), type }));
  return { actor: { id: u.id, role: "DRIVER" }, vehicleId: v.id };
}

async function facility(name: string, over: Record<string, unknown> = {}, policy: Record<string, unknown> = {}) {
  const f = await db.parkingFacility.create({
    data: {
      organizationId: orgId, name: `${name}-${tag}`, type: "MALL", status: "APPROVED", address: "Test", is24Hours: true,
      latitude: 9.4, longitude: 39.2, totalCapacity: 3, inventoryModel: "CAPACITY_BASED",
      reservationPolicy: { create: { minAdvanceMinutes: 0, ...policy } }, cancellationPolicy: { create: { freeCancelBeforeMinutes: 60, refundPercentBefore: 100, refundPercentAfter: 0 } },
      pricingRules: { create: { firstUnitCents: 3000, additionalUnitCents: 2000 } },
      ...over,
    },
  });
  facilityIds.push(f.id);
  return f;
}
async function withSpaces(facilityId: string, n: number) {
  const floor = await db.parkingFloor.create({ data: { facilityId, name: "G" } });
  const zone = await db.parkingZone.create({ data: { facilityId, floorId: floor.id, name: "Z" } });
  const out = [];
  for (let i = 1; i <= n; i++) out.push(await db.parkingSpace.create({ data: { facilityId, zoneId: zone.id, label: `S${i}`, vehicleTypes: ["SEDAN", "MOTORCYCLE"] } }));
  await db.parkingFacility.update({ where: { id: facilityId }, data: { totalCapacity: n } });
  return out;
}
const book = (d: Driver, facilityId: string, startH: number, durationMinutes: number, extra: object = {}, now = NOW) =>
  createReservation(d.actor, createReservationSchema.parse({ facilityId, vehicleId: d.vehicleId, startAt: at(startH), durationMinutes, ...extra }), now);

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { name: `Org-${tag}`, status: "ACTIVE" } })).id;
  await db.platformSetting.upsert({ where: { key: "hold.minutes" }, update: {}, create: { key: "hold.minutes", value: 10 } });
});

afterAll(async () => {
  await db.reservationExtension.deleteMany({ where: { reservation: { facilityId: { in: facilityIds } } } });
  await db.reservation.deleteMany({ where: { facilityId: { in: facilityIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.parkingFacility.deleteMany({ where: { id: { in: facilityIds } } });
  await db.vehicle.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.organization.delete({ where: { id: orgId } });
});

describe("creating a hold", () => {
  it("prices on the server, holds inventory and sets a deadline", async () => {
    const f = await facility("basic", {}, { depositPercent: 20, graceMinutes: 20 });
    const d = await driver("a1");
    const r = await book(d, f.id, 8, 120, { destination: { name: "Meskel Square", latitude: 9.01, longitude: 38.76 } });
    expect(r).toMatchObject({ status: "PENDING_PAYMENT", blocksInventory: true, allocation: "CAPACITY", spaceId: null, estimatedFeeCents: 5000, depositCents: 1000, graceMinutes: 20, destinationName: "Meskel Square" });
    expect(r.reference).toMatch(/^SP-[A-HJ-NP-Z2-9]{6}$/);
    expect(r.holdExpiresAt!.getTime()).toBe(NOW.getTime() + 10 * MIN);
    expect((r.policySnapshot as { pricingRule: { firstUnitCents: number } }).pricingRule.firstUnitCents).toBe(3000);
  });

  it("enforces the facility's rules: duration, advance window, opening hours, price, status", async () => {
    const f = await facility("rules", {}, { minDurationMinutes: 60, maxDurationMinutes: 180, minAdvanceMinutes: 30, maxAdvanceDays: 2 });
    const d = await driver("b1");
    await expect(book(d, f.id, 8, 240)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(book(d, f.id, 8, 30)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(createReservation(d.actor, createReservationSchema.parse({ facilityId: f.id, vehicleId: d.vehicleId, startAt: at(6, 10), durationMinutes: 60 }), NOW)).rejects.toThrow(/ahead/);
    await expect(createReservation(d.actor, createReservationSchema.parse({ facilityId: f.id, vehicleId: d.vehicleId, startAt: at(5), durationMinutes: 60 }), NOW)).rejects.toThrow(/past/);
    const closed = await facility("closed", { is24Hours: false, hours: { create: [{ dayOfWeek: 1, opensMinute: 8 * 60, closesMinute: 10 * 60 }] } });
    await expect(book(d, closed.id, 8, 120)).rejects.toThrow(/Closed/); // 11:00-13:00 local
    const noprice = await facility("noprice", { pricingRules: { create: { firstUnitCents: 1, additionalUnitCents: 1, vehicleType: "TRUCK" } } });
    await expect(book(d, noprice.id, 8, 60)).rejects.toThrow(/price/);
    const susp = await facility("susp", { status: "SUSPENDED" });
    await expect(book(d, susp.id, 8, 60)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("limits unpaid holds per driver and overlapping bookings per vehicle", async () => {
    const f = await facility("limits", { totalCapacity: 50 });
    const d = await driver("c1");
    await book(d, f.id, 8, 60);
    await expect(book(d, f.id, 8, 60)).rejects.toThrow(/overlaps/);
    await book(d, f.id, 10, 60);
    await book(d, f.id, 12, 60);
    await expect(book(d, f.id, 14, 60)).rejects.toThrow(/unpaid holds/);
  });

  it("will not use another driver's vehicle", async () => {
    const f = await facility("owner");
    const a = await driver("d1");
    const b = await driver("d2");
    await expect(createReservation(a.actor, createReservationSchema.parse({ facilityId: f.id, vehicleId: b.vehicleId, startAt: at(8), durationMinutes: 60 }), NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("no double booking under concurrency", () => {
  it("capacity-based: 10 simultaneous requests for 3 units -> exactly 3 succeed", async () => {
    const f = await facility("capconc", { totalCapacity: 3 });
    const ds = await Promise.all(Array.from({ length: 10 }, (_, i) => driver(`e${i}`)));
    const results = await Promise.allSettled(ds.map((d) => book(d, f.id, 8, 60)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    for (const r of results.filter((x) => x.status === "rejected")) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    expect(await db.reservation.count({ where: { facilityId: f.id, blocksInventory: true } })).toBe(3);
  });

  it("one numbered space: 8 simultaneous requests -> exactly 1 succeeds", async () => {
    const f = await facility("oneconc", { inventoryModel: "INDIVIDUAL_SPACES", totalCapacity: 0 });
    await withSpaces(f.id, 1);
    const ds = await Promise.all(Array.from({ length: 8 }, (_, i) => driver(`f${i}`)));
    const results = await Promise.allSettled(ds.map((d) => book(d, f.id, 8, 60)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
  });

  it("three numbered spaces: 9 simultaneous requests -> 3 succeed on 3 different spaces", async () => {
    const f = await facility("threeconc", { inventoryModel: "INDIVIDUAL_SPACES", totalCapacity: 0 });
    await withSpaces(f.id, 3);
    const ds = await Promise.all(Array.from({ length: 9 }, (_, i) => driver(`g${i}`)));
    const results = await Promise.allSettled(ds.map((d) => book(d, f.id, 8, 60)));
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof book>>> => r.status === "fulfilled");
    expect(ok).toHaveLength(3);
    expect(new Set(ok.map((r) => r.value.spaceId)).size).toBe(3);
  });

  it("peak-based capacity: a 2h booking fits beside two back-to-back 1h bookings", async () => {
    const f = await facility("peak", { totalCapacity: 2 });
    const [a, b, c] = await Promise.all([driver("h1"), driver("h2"), driver("h3")]);
    await book(a, f.id, 8, 60);
    await book(b, f.id, 9, 60);
    await expect(book(c, f.id, 8, 120)).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
    const d4 = await driver("h4");
    await expect(book(d4, f.id, 8, 60)).rejects.toMatchObject({ code: "CONFLICT" }); // 3 would be concurrent at 08:00
  });

  it("a chosen space is honoured, and a taken one is refused cleanly", async () => {
    const f = await facility("pick", { inventoryModel: "INDIVIDUAL_SPACES", totalCapacity: 0 });
    const [s1, s2] = await withSpaces(f.id, 2);
    const [a, b] = await Promise.all([driver("i1"), driver("i2")]);
    expect((await book(a, f.id, 8, 60, { spaceId: s2!.id })).spaceId).toBe(s2!.id);
    await expect(book(b, f.id, 8, 60, { spaceId: s2!.id })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await book(b, f.id, 8, 60)).spaceId).toBe(s1!.id);
  });
});

describe("hold expiry, confirmation, cancellation", () => {
  it("an unpaid hold expires and frees the space; a late payment is refused", async () => {
    const f = await facility("expiry", { totalCapacity: 1 });
    const [a, b] = await Promise.all([driver("j1"), driver("j2")]);
    const r = await book(a, f.id, 8, 60);
    await expect(book(b, f.id, 8, 60)).rejects.toMatchObject({ code: "CONFLICT" });
    const later = new Date(NOW.getTime() + 11 * MIN);
    // availability ignores the expired hold even before the sweeper runs
    const q = await quoteReservation(f.id, T(8), 60, "SEDAN", later);
    expect(q.availableUnits).toBe(1);
    await expect(confirmReservation(r.id, later, a.actor)).rejects.toThrow(/expired/);
    expect((await db.reservation.findUnique({ where: { id: r.id } }))).toMatchObject({ status: "EXPIRED", blocksInventory: false });
    await expect(book(b, f.id, 8, 60, {}, later)).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
  });

  it("sweep expires stale holds in bulk and is idempotent", async () => {
    const f = await facility("sweep", { totalCapacity: 5 });
    const d = await driver("k1");
    const r = await book(d, f.id, 8, 60);
    const later = new Date(NOW.getTime() + 11 * MIN);
    expect((await sweep(later)).expiredHolds).toBeGreaterThanOrEqual(1);
    expect((await sweep(later)).expiredHolds).toBe(0);
    expect((await db.reservation.findUnique({ where: { id: r.id } }))!.status).toBe("EXPIRED");
  });

  it("confirm moves PENDING_PAYMENT -> CONFIRMED once; paying twice is refused", async () => {
    const f = await facility("confirm");
    const d = await driver("l1");
    const r = await book(d, f.id, 8, 60);
    const c = await confirmReservation(r.id, NOW, d.actor);
    expect(c).toMatchObject({ status: "CONFIRMED", holdExpiresAt: null, blocksInventory: true });
    await expect(confirmReservation(r.id, NOW, d.actor)).rejects.toMatchObject({ code: "CONFLICT" });
    const other = await driver("l2");
    await expect(confirmReservation(r.id, NOW, other.actor)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cancelling frees inventory; refund follows the snapshotted policy", async () => {
    const f = await facility("cancel", { totalCapacity: 1 }, { depositPercent: 50 });
    const [a, b] = await Promise.all([driver("m1"), driver("m2")]);
    const r = await book(a, f.id, 12, 60); // start 12:00Z, fee 3000, deposit 1500
    await confirmReservation(r.id, NOW, a.actor);
    await expect(book(b, f.id, 12, 60)).rejects.toMatchObject({ code: "CONFLICT" });
    const out = await cancelReservation(a.actor, r.id, NOW); // 6h before: free cancel
    expect(out).toMatchObject({ status: "CANCELLED", refundDueCents: 1500 });
    expect(await db.reservation.findUnique({ where: { id: r.id } })).toMatchObject({ blocksInventory: false, status: "CANCELLED" });
    await expect(book(b, f.id, 12, 60)).resolves.toBeTruthy();
    await expect(cancelReservation(a.actor, r.id, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("late cancellation refunds less; an unpaid hold refunds nothing", async () => {
    const f = await facility("latecancel", { totalCapacity: 5 }, { depositPercent: 50 });
    const a = await driver("n1");
    const r = await book(a, f.id, 8, 60);
    await confirmReservation(r.id, NOW, a.actor);
    const late = new Date(T(8).getTime() - 30 * MIN); // inside the 60-minute window
    expect((await cancelReservation(a.actor, r.id, late)).refundDueCents).toBe(0);
    const b = await driver("n2");
    const h = await book(b, f.id, 10, 60);
    expect((await cancelReservation(b.actor, h.id, NOW)).refundDueCents).toBe(0);
  });

  it("confirmed reservations that nobody turns up for become NO_SHOW after the grace period", async () => {
    const f = await facility("noshow", { totalCapacity: 1 }, { graceMinutes: 15 });
    const [a, b] = await Promise.all([driver("o1"), driver("o2")]);
    const r = await book(a, f.id, 8, 120);
    await confirmReservation(r.id, NOW, a.actor);
    await sweep(T(8, 14));
    expect((await db.reservation.findUnique({ where: { id: r.id } }))!.status).toBe("CONFIRMED");
    expect((await sweep(T(8, 16))).noShows).toBeGreaterThanOrEqual(1);
    expect(await db.reservation.findUnique({ where: { id: r.id } })).toMatchObject({ status: "NO_SHOW", blocksInventory: false });
    await expect(book(b, f.id, 9, 60, {}, T(8, 16))).resolves.toBeTruthy(); // space is available again
  });
});

describe("isolation between drivers", () => {
  it("another driver gets NOT_FOUND for read, cancel and extend", async () => {
    const f = await facility("iso");
    const [a, b] = await Promise.all([driver("p1"), driver("p2")]);
    const r = await book(a, f.id, 8, 60);
    await expect(getMyReservation(b.actor, r.id, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelReservation(b.actor, r.id, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requestExtension(b.actor, r.id, 30, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listMyReservations(b.actor, "all", NOW)).some((x) => x.id === r.id)).toBe(false);
    expect((await listMyReservations(a.actor, "upcoming", NOW)).some((x) => x.id === r.id)).toBe(true);
  });

  it("vehicles with a live reservation cannot be removed", async () => {
    const f = await facility("vrem");
    const a = await driver("q1");
    await book(a, f.id, 8, 60);
    await expect(removeVehicle(a.actor.id, a.vehicleId)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("extensions", () => {
  it("extends a confirmed booking, charges the difference and holds the extra time", async () => {
    const f = await facility("ext", { totalCapacity: 1 });
    const [a, b] = await Promise.all([driver("r1"), driver("r2")]);
    const r = await book(a, f.id, 8, 60);
    await confirmReservation(r.id, NOW, a.actor);
    const ext = await requestExtension(a.actor, r.id, 60, NOW);
    expect(ext).toMatchObject({ status: "PENDING_PAYMENT", additionalFeeCents: 2000 });
    const after = await db.reservation.findUnique({ where: { id: r.id } });
    expect(after!.endAt.toISOString()).toBe(at(10));
    expect(after!.estimatedFeeCents).toBe(5000);
    // the extra hour is now held: nobody else can take it
    await expect(book(b, f.id, 9, 60)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(requestExtension(a.actor, r.id, 30, NOW)).rejects.toThrow(/waiting for payment/);
    expect(await confirmExtension(a.actor, ext.id, NOW)).toMatchObject({ status: "CONFIRMED" });
  });

  it("an unpaid extension is reverted by the sweeper and the time is released", async () => {
    const f = await facility("extexp", { totalCapacity: 1 });
    const [a, b] = await Promise.all([driver("s1"), driver("s2")]);
    const r = await book(a, f.id, 8, 60);
    await confirmReservation(r.id, NOW, a.actor);
    await requestExtension(a.actor, r.id, 60, NOW);
    const later = new Date(NOW.getTime() + 11 * MIN);
    expect((await sweep(later)).expiredExtensions).toBeGreaterThanOrEqual(1);
    expect(await db.reservation.findUnique({ where: { id: r.id } })).toMatchObject({ estimatedFeeCents: 3000 });
    expect((await db.reservation.findUnique({ where: { id: r.id } }))!.endAt.toISOString()).toBe(at(9));
    await expect(book(b, f.id, 9, 60, {}, later)).resolves.toBeTruthy();
  });

  it("is refused when the extra time is already booked (numbered space) and changes nothing", async () => {
    const f = await facility("extconf", { inventoryModel: "INDIVIDUAL_SPACES", totalCapacity: 0 });
    const [s] = await withSpaces(f.id, 1);
    const [a, b] = await Promise.all([driver("t1"), driver("t2")]);
    const r = await book(a, f.id, 8, 60, { spaceId: s!.id });
    await confirmReservation(r.id, NOW, a.actor);
    await book(b, f.id, 9, 60, { spaceId: s!.id }); // takes the next hour
    await expect(requestExtension(a.actor, r.id, 30, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.reservation.findUnique({ where: { id: r.id } })).toMatchObject({ estimatedFeeCents: 3000 });
    expect(await db.reservationExtension.count({ where: { reservationId: r.id } })).toBe(0);
  });

  it("respects extension policy, max stay and opening hours", async () => {
    const off = await facility("extoff", {}, { allowExtensions: false });
    const a = await driver("u1");
    const r1 = await book(a, off.id, 8, 60);
    await confirmReservation(r1.id, NOW, a.actor);
    await expect(requestExtension(a.actor, r1.id, 30, NOW)).rejects.toThrow(/does not allow/);

    const max = await facility("extmax", { totalCapacity: 5 }, { maxDurationMinutes: 90 });
    const b = await driver("u2");
    const r2 = await book(b, max.id, 8, 60);
    await confirmReservation(r2.id, NOW, b.actor);
    await expect(requestExtension(b.actor, r2.id, 60, NOW)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const hrs = await facility("exthrs", { is24Hours: false, hours: { create: [{ dayOfWeek: 1, opensMinute: 8 * 60, closesMinute: 12 * 60 }] } });
    const c = await driver("u3");
    const r3 = await book(c, hrs.id, 6, 60); // 09:00-10:00 local
    await confirmReservation(r3.id, NOW, c.actor);
    await expect(requestExtension(c.actor, r3.id, 180, NOW)).rejects.toThrow(/closed/); // would run to 13:00 local

    const pendingOnly = await driver("u4");
    const r4 = await book(pendingOnly, max.id, 11, 60);
    await expect(requestExtension(pendingOnly.actor, r4.id, 30, NOW)).rejects.toThrow(/confirmed or active/);
  });
});

describe("holds are visible to discovery", () => {
  it("a live hold reduces availability; an expired one does not", async () => {
    const f = await facility("disc", { latitude: 9.45, longitude: 39.25, totalCapacity: 2 });
    const d = await driver("v1");
    await book(d, f.id, 8, 60);
    const q = (now: Date) => discover(discoverQuery.parse({ lat: "9.45", lng: "39.25", radius: "500", arrivalAt: at(8), durationMinutes: "60" }), now);
    expect((await q(NOW)).facilities.find((x) => x.id === f.id)!.availableUnits).toBe(1);
    expect((await q(new Date(NOW.getTime() + 11 * MIN))).facilities.find((x) => x.id === f.id)!.availableUnits).toBe(2);
  });
});
