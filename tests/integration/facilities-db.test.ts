import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/platform/db";
import { registerOrganization } from "@/modules/organizations/service";
import { organizationRegisterSchema, facilityCreateSchema } from "@/modules/facilities/schemas";
import {
  createFacility, getFacility, listFacilities, reviewFacility, setOperatingHours, setPolicies, setPricingRules, updateFacility,
} from "@/modules/facilities/service";
import { addFloor, addSpaces, addZone, updateSpace } from "@/modules/inventory/service";
import type { Actor } from "@/modules/rbac/scope";

const tag = `f${Date.now()}`;
const PW = "Passw0rd!x";
const mail = (n: string) => `${n}.${tag}@test.example`;

let adminA: Actor, adminB: Actor, superAdmin: Actor, driver: Actor;
let orgA: string, orgB: string;

const reg = (n: string) =>
  registerOrganization(
    organizationRegisterSchema.parse({ organization: { name: `${n}-${tag}` }, admin: { email: mail(n), fullName: n, password: PW } }),
  );
const facilityInput = (over: object = {}) =>
  facilityCreateSchema.parse({ name: `Lot-${tag}`, type: "MALL", address: "Bole", latitude: 9.0, longitude: 38.75, ...over });

beforeAll(async () => {
  const a = await reg("orgA");
  const b = await reg("orgB");
  adminA = { id: a.user.id, role: "FACILITY_ADMIN" };
  adminB = { id: b.user.id, role: "FACILITY_ADMIN" };
  orgA = a.organization.id;
  orgB = b.organization.id;
  superAdmin = { id: (await db.user.create({ data: { email: mail("super"), passwordHash: "x", role: "SUPER_ADMIN" } })).id, role: "SUPER_ADMIN" };
  driver = { id: (await db.user.create({ data: { email: mail("drv"), passwordHash: "x", role: "DRIVER" } })).id, role: "DRIVER" };
  await db.platformSetting.upsert({ where: { key: "deposit.minPercent" }, update: {}, create: { key: "deposit.minPercent", value: 10 } });
  await db.platformSetting.upsert({ where: { key: "deposit.maxPercent" }, update: {}, create: { key: "deposit.maxPercent", value: 100 } });
});

afterAll(async () => {
  const ids = (await db.user.findMany({ where: { email: { endsWith: `${tag}@test.example` } }, select: { id: true } })).map((u) => u.id);
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.parkingFacility.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("organization registration", () => {
  it("creates a FACILITY_ADMIN with an active organization and membership", async () => {
    const m = await db.organizationMember.findFirstOrThrow({ where: { userId: adminA.id }, include: { organization: true, user: true } });
    expect(m.user.role).toBe("FACILITY_ADMIN");
    expect(m.organization.status).toBe("ACTIVE");
  });
  it("rejects a duplicate email", async () => {
    await expect(reg("orgA")).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("facility creation & isolation", () => {
  let facA: string;
  it("new facilities are PENDING_APPROVAL regardless of input", async () => {
    const f = await createFacility(adminA, facilityInput());
    facA = f.id;
    expect(f.status).toBe("PENDING_APPROVAL");
    expect(f.organizationId).toBe(orgA);
  });
  it("derives PostGIS location from coordinates", async () => {
    const [r] = await db.$queryRaw<{ ok: boolean }[]>`SELECT location IS NOT NULL AS ok FROM "ParkingFacility" WHERE id = ${facA}`;
    expect(r!.ok).toBe(true);
  });
  it("drivers cannot create or list facilities", async () => {
    await expect(createFacility(driver, facilityInput())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listFacilities(driver, { page: 1, limit: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("an admin cannot create a facility inside another organization", async () => {
    await expect(createFacility(adminA, facilityInput({ organizationId: orgB }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("an admin cannot read, update or configure another org's facility (#23)", async () => {
    await expect(getFacility(adminB, facA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateFacility(adminB, facA, { name: "Hijacked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setOperatingHours(adminB, facA, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setPricingRules(adminB, facA, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addFloor(adminB, facA, { name: "X", level: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("list only returns the caller's facilities; super admin sees all", async () => {
    const mine = await listFacilities(adminB, { page: 1, limit: 50 });
    expect(mine.rows.every((r) => r.organization.id === orgB)).toBe(true);
    const all = await listFacilities(superAdmin, { page: 1, limit: 100, status: "PENDING_APPROVAL" });
    expect(all.rows.some((r) => r.id === facA)).toBe(true);
  });
  it("an admin cannot change status or inventory model through update", async () => {
    await updateFacility(adminA, facA, { name: "Renamed", status: "APPROVED", inventoryModel: "CAPACITY_BASED" } as never);
    const f = await db.parkingFacility.findUniqueOrThrow({ where: { id: facA } });
    expect(f.status).toBe("PENDING_APPROVAL");
    expect(f.inventoryModel).toBe("INDIVIDUAL_SPACES");
  });
});

describe("inventory", () => {
  let fac: string, floor: string, zone: string;
  beforeAll(async () => {
    fac = (await createFacility(adminA, facilityInput({ name: `Inv-${tag}` }))).id;
  });

  it("builds floor -> zone -> spaces and keeps capacity in sync", async () => {
    floor = (await addFloor(adminA, fac, { name: "Ground", level: 0 })).id;
    zone = (await addZone(adminA, fac, { floorId: floor, name: "A" })).id;
    const spaces = await addSpaces(adminA, fac, { zoneId: zone, prefix: "A", from: 1, count: 10, vehicleTypes: ["SEDAN"], isCovered: true });
    expect(spaces.map((s) => s.label)).toContain("A10");
    expect((await db.parkingFacility.findUniqueOrThrow({ where: { id: fac } })).totalCapacity).toBe(10);
  });
  it("rejects duplicate labels atomically (nothing created)", async () => {
    await expect(addSpaces(adminA, fac, { zoneId: zone, prefix: "A", from: 9, count: 5, vehicleTypes: ["SEDAN"], isCovered: false })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.parkingSpace.count({ where: { facilityId: fac } })).toBe(10);
  });
  it("refuses a zone that references another facility's floor", async () => {
    const other = (await createFacility(adminB, facilityInput({ name: `Oth-${tag}` }))).id;
    const otherFloor = (await addFloor(adminB, other, { name: "G", level: 0 })).id;
    await addZone(adminB, other, { floorId: otherFloor, name: "Z" });
    await expect(addZone(adminA, fac, { floorId: otherFloor, name: "Z" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("refuses a space whose zone belongs to another facility", async () => {
    const other = await db.parkingZone.findFirstOrThrow({ where: { facility: { organizationId: orgB } } });
    await expect(addSpaces(adminA, fac, { zoneId: other.id, label: "ZZ", vehicleTypes: ["SEDAN"], isCovered: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("can mark a space unavailable, but not in someone else's facility", async () => {
    const s = await db.parkingSpace.findFirstOrThrow({ where: { facilityId: fac } });
    expect((await updateSpace(adminA, s.id, { status: "MAINTENANCE" })).status).toBe("MAINTENANCE");
    await expect(updateSpace(adminB, s.id, { status: "AVAILABLE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("capacity-based facilities have no individual spaces", async () => {
    const cap = await createFacility(adminA, facilityInput({ name: `Cap-${tag}`, inventoryModel: "CAPACITY_BASED", totalCapacity: 40 }));
    expect(cap.totalCapacity).toBe(40);
    await expect(addFloor(adminA, cap.id, { name: "G", level: 0 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("pricing & policies", () => {
  let fac: string;
  beforeAll(async () => {
    fac = (await createFacility(adminA, facilityInput({ name: `Pol-${tag}` }))).id;
  });
  const policy = (deposit: number) => ({
    reservation: { depositPercent: deposit, graceMinutes: 15, minAdvanceMinutes: 0, maxAdvanceDays: 7, minDurationMinutes: 30, maxDurationMinutes: 600,
      allowExtensions: true, allowGraceExtension: false, depositRefundableOnEarlyExit: false, extensionGraceMinutes: 15 },
    cancellation: { freeCancelBeforeMinutes: 60, refundPercentBefore: 100, refundPercentAfter: 0, noShowFeeCents: 0, forfeitDepositOnNoShow: true },
  });
  it("enforces platform deposit limits", async () => {
    await expect(setPolicies(adminA, fac, policy(5))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await setPolicies(adminA, fac, policy(25))).reservation.depositPercent).toBe(25);
  });
  it("replaces pricing rules wholesale", async () => {
    const rule = { name: "A", vehicleType: null, unit: "HOURLY" as const, firstUnitCents: 3000, additionalUnitCents: 2000, minimumChargeCents: 3000, dailyCapCents: null, rounding: "UP_TO_HOUR" as const, active: true };
    await setPricingRules(adminA, fac, [rule, { ...rule, name: "B" }]);
    expect(await db.pricingRule.count({ where: { facilityId: fac } })).toBe(2);
    await setPricingRules(adminA, fac, [rule]);
    expect(await db.pricingRule.count({ where: { facilityId: fac } })).toBe(1);
  });
});

describe("super-admin review", () => {
  let fac: string;
  beforeAll(async () => {
    fac = (await createFacility(adminA, facilityInput({ name: `Rev-${tag}`, inventoryModel: "CAPACITY_BASED", totalCapacity: 30 }))).id;
  });
  it("only a super admin can approve (#26)", async () => {
    await expect(reviewFacility(adminA, fac, "approve")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reviewFacility(driver, fac, "approve")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("refuses to approve an incomplete facility and says why", async () => {
    const e = await reviewFacility(superAdmin, fac, "approve").catch((x) => x);
    expect(e.code).toBe("CONFLICT");
    expect(e.details.blockers).toEqual(expect.arrayContaining(["Operating hours not set", "No active pricing rule"]));
  });
  it("approves once capacity, hours and pricing exist; writes an audit entry", async () => {
    await setOperatingHours(adminA, fac, [{ dayOfWeek: 1, opensMinute: 480, closesMinute: 1200 }]);
    await setPricingRules(adminA, fac, [{ name: "S", vehicleType: null, unit: "HOURLY", firstUnitCents: 3000, additionalUnitCents: 2500, minimumChargeCents: 0, dailyCapCents: null, rounding: "UP_TO_HOUR", active: true }]);
    expect((await reviewFacility(superAdmin, fac, "approve")).status).toBe("APPROVED");
    expect(await db.auditLog.count({ where: { entityId: fac, action: "facility.approve" } })).toBe(1);
  });
  it("cannot approve twice; can suspend then reinstate", async () => {
    await expect(reviewFacility(superAdmin, fac, "approve")).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await reviewFacility(superAdmin, fac, "suspend", "Complaint under review")).status).toBe("SUSPENDED");
    await expect(updateFacility(adminA, fac, { name: "Edited name" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await reviewFacility(superAdmin, fac, "approve")).status).toBe("APPROVED");
  });
  it("reject -> operator edit resubmits for review", async () => {
    const f2 = (await createFacility(adminA, facilityInput({ name: `Rej-${tag}` }))).id;
    const r = await reviewFacility(superAdmin, f2, "reject", "Address could not be verified");
    expect(r.status).toBe("REJECTED");
    expect(r.rejectionReason).toMatch(/Address/);
    const again = await updateFacility(adminA, f2, { address: "Corrected address, Bole" });
    expect(again.status).toBe("PENDING_APPROVAL");
    expect(again.rejectionReason).toBeNull();
  });
});
