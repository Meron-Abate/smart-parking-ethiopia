/**
 * DEVELOPMENT SEED ONLY. Fake data, well-known passwords. Refuses to run in production.
 * Coordinates are approximate points in Addis Ababa, for exercising geospatial code — not surveyed data.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config({ quiet: true });
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

const db = new PrismaClient();
const PASSWORD = "Passw0rd!dev";

async function user(email: string, role: "DRIVER" | "ATTENDANT" | "FACILITY_ADMIN" | "SUPER_ADMIN", fullName: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  return db.user.upsert({
    where: { email },
    update: { role },
    create: { email, role, passwordHash, profile: { create: { fullName } } },
  });
}

async function main() {
  for (const [id, name, isLive] of [["mock", "Mock provider (development only)", false]] as const) {
    await db.paymentProvider.upsert({ where: { id }, update: {}, create: { id, name, enabled: true, isLive } });
  }
  for (const [key, value] of [
    ["deposit.minPercent", 10],
    ["deposit.maxPercent", 100],
    ["hold.minutes", 10],
    ["commission.defaultBps", 1000],
  ] as const) {
    await db.platformSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  await user("admin@parking.test", "SUPER_ADMIN", "Platform Admin");
  const owner = await user("owner@bole-atlas-parking.test", "FACILITY_ADMIN", "Hana Owner");
  const attendant = await user("attendant@bole-atlas-parking.test", "ATTENDANT", "Dawit Attendant");
  await user("driver@parking.test", "DRIVER", "Abebe Driver");

  let org = await db.organization.findFirst({ where: { name: "Demo Parking PLC" } });
  org ??= await db.organization.create({ data: { name: "Demo Parking PLC", status: "ACTIVE" } });
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
    update: {},
    create: { organizationId: org.id, userId: owner.id },
  });

  const facilities = [
    { name: "Atlas Bole Parking (demo)", type: "COMMERCIAL", lat: 8.9958, lng: 38.7864, hood: "Bole", cap: 60 },
    { name: "Meskel Square Lot (demo)", type: "PRIVATE_OPERATOR", lat: 9.0107, lng: 38.7612, hood: "Meskel Square", cap: 120 },
    { name: "Kazanchis Tower Parking (demo)", type: "OFFICE", lat: 9.0192, lng: 38.7725, hood: "Kazanchis", cap: 40 },
  ] as const;

  for (const f of facilities) {
    const exists = await db.parkingFacility.findFirst({ where: { name: f.name } });
    if (exists) continue;
    const created = await db.parkingFacility.create({
      data: {
        organizationId: org.id,
        name: f.name,
        type: f.type,
        status: "APPROVED",
        address: `${f.hood}, Addis Ababa`,
        neighborhood: f.hood,
        latitude: f.lat,
        longitude: f.lng,
        totalCapacity: f.cap,
        inventoryModel: "CAPACITY_BASED",
        reservationPolicy: { create: {} },
        cancellationPolicy: { create: {} },
        pricingRules: { create: { firstUnitCents: 3000, additionalUnitCents: 2500, minimumChargeCents: 3000 } },
      },
    });
    if (f.name.startsWith("Atlas")) {
      await db.facilityStaff.create({ data: { facilityId: created.id, userId: attendant.id, role: "ATTENDANT" } });
    }
  }
  console.log("Seeded. Dev password for all users:", PASSWORD);
}

main().finally(() => db.$disconnect());
