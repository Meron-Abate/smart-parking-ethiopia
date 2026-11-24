import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/platform/db";
import { register, login } from "@/modules/auth/service";
import { registerSchema } from "@/modules/auth/schemas";
import { assertFacilityAccess } from "@/modules/rbac/scope";
import { AppError } from "@/platform/errors";

const tag = `t${Date.now()}`;
const mail = (n: string) => `${n}.${tag}@test.example`;
const PW = "Passw0rd!x";

let orgA: string, orgB: string, facA: string, facB: string;
let adminA: string, adminB: string, attA: string, driver: string, superAdmin: string;

async function mk(n: string, role: "DRIVER" | "ATTENDANT" | "FACILITY_ADMIN" | "SUPER_ADMIN") {
  return (await db.user.create({ data: { email: mail(n), passwordHash: "x", role } })).id;
}
async function mkFacility(organizationId: string, name: string) {
  return (
    await db.parkingFacility.create({
      data: { organizationId, name: `${name}-${tag}`, type: "HOTEL", address: "x", latitude: 9.0, longitude: 38.75 },
    })
  ).id;
}

beforeAll(async () => {
  orgA = (await db.organization.create({ data: { name: `A-${tag}` } })).id;
  orgB = (await db.organization.create({ data: { name: `B-${tag}` } })).id;
  facA = await mkFacility(orgA, "A");
  facB = await mkFacility(orgB, "B");
  adminA = await mk("adminA", "FACILITY_ADMIN");
  adminB = await mk("adminB", "FACILITY_ADMIN");
  attA = await mk("attA", "ATTENDANT");
  driver = await mk("driver", "DRIVER");
  superAdmin = await mk("super", "SUPER_ADMIN");
  await db.organizationMember.create({ data: { organizationId: orgA, userId: adminA } });
  await db.organizationMember.create({ data: { organizationId: orgB, userId: adminB } });
  await db.facilityStaff.create({ data: { facilityId: facA, userId: attA } });
});

afterAll(async () => {
  await db.facilityStaff.deleteMany({ where: { facilityId: { in: [facA, facB] } } });
  await db.parkingFacility.deleteMany({ where: { id: { in: [facA, facB] } } });
  await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await db.auditLog.deleteMany({ where: { actor: { email: { endsWith: `${tag}@test.example` } } } });
  await db.user.deleteMany({ where: { email: { endsWith: `${tag}@test.example` } } });
  await db.$disconnect();
});

describe("registration & login", () => {
  it("always creates a DRIVER, even if the payload tries to set a role", async () => {
    const input = registerSchema.parse({ email: mail("reg"), fullName: "Reg User", password: PW, role: "SUPER_ADMIN" });
    const u = await register(input);
    expect(u.role).toBe("DRIVER");
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.passwordHash).not.toContain(PW);
  });

  it("rejects duplicate accounts with CONFLICT", async () => {
    const input = registerSchema.parse({ email: mail("reg"), fullName: "Dup", password: PW });
    await expect(register(input)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("logs in by email and by normalised phone", async () => {
    const phone = `09${String(Date.now()).slice(-8)}`;
    await register(registerSchema.parse({ phone, fullName: "Phone User", password: PW }));
    expect((await login({ identifier: phone, password: PW })).phone).toBe(`+251${phone.slice(1)}`);
    expect((await login({ identifier: mail("reg").toUpperCase(), password: PW })).email).toBe(mail("reg"));
    await db.user.deleteMany({ where: { phone: `+251${phone.slice(1)}` } });
  });

  it("gives the same error for unknown user and wrong password", async () => {
    const a = await login({ identifier: mail("nobody"), password: PW }).catch((e) => e);
    const b = await login({ identifier: mail("reg"), password: "wrong-Pass1" }).catch((e) => e);
    expect(a).toBeInstanceOf(AppError);
    expect(a.code).toBe("INVALID_CREDENTIALS");
    expect(b.code).toBe("INVALID_CREDENTIALS");
    expect(a.message).toBe(b.message);
  });

  it("locks the account after 5 failures, even for the right password", async () => {
    await register(registerSchema.parse({ email: mail("lock"), fullName: "Lock", password: PW }));
    for (let i = 0; i < 5; i++) await login({ identifier: mail("lock"), password: "bad-Pass1" }).catch(() => {});
    await expect(login({ identifier: mail("lock"), password: PW })).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
  });

  it("refuses suspended users", async () => {
    await register(registerSchema.parse({ email: mail("susp"), fullName: "Susp", password: PW }));
    await db.user.update({ where: { email: mail("susp") }, data: { status: "SUSPENDED" } });
    await expect(login({ identifier: mail("susp"), password: PW })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("facility isolation (tests #23, #24)", () => {
  const actor = (id: string, role: "DRIVER" | "ATTENDANT" | "FACILITY_ADMIN" | "SUPER_ADMIN") => ({ id, role });
  it("admin reaches own facility", async () => {
    await expect(assertFacilityAccess(db, actor(adminA, "FACILITY_ADMIN"), facA)).resolves.toBeUndefined();
  });
  it("admin of org A cannot access org B's facility", async () => {
    await expect(assertFacilityAccess(db, actor(adminA, "FACILITY_ADMIN"), facB)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("attendant only reaches facilities they staff", async () => {
    await expect(assertFacilityAccess(db, actor(attA, "ATTENDANT"), facA)).resolves.toBeUndefined();
    await expect(assertFacilityAccess(db, actor(attA, "ATTENDANT"), facB)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("deactivated attendant loses access immediately", async () => {
    await db.facilityStaff.update({ where: { facilityId_userId: { facilityId: facA, userId: attA } }, data: { active: false } });
    await expect(assertFacilityAccess(db, actor(attA, "ATTENDANT"), facA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("drivers never have facility access; super admin always does", async () => {
    await expect(assertFacilityAccess(db, actor(driver, "DRIVER"), facA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertFacilityAccess(db, actor(superAdmin, "SUPER_ADMIN"), facB)).resolves.toBeUndefined();
  });
  it("unknown facility is NOT_FOUND", async () => {
    await expect(assertFacilityAccess(db, actor(superAdmin, "SUPER_ADMIN"), "nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
