/**
 * DEVELOPMENT ONLY. Adds ~16 clearly-labelled "(demo)" facilities around well-known Addis destinations so you can
 * try destination search, radius discovery, filters, sorting and the availability states (available / few left /
 * full / closed). Coordinates are offsets from approximate landmark positions: they are NOT real parking lots.
 *
 *   npm run db:seed:demo            # (re)create the demo facilities (idempotent)
 *   npm run db:seed:demo -- --remove  # delete them again
 *
 * Requires `npm run db:seed` to have been run once (it creates the demo organisation and driver).
 */
import { PrismaClient, type FacilityType, type VehicleType } from "@prisma/client";
import { config } from "dotenv";
import { LANDMARKS, loadLandmarks } from "./landmarks";

config({ quiet: true });
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");

const db = new PrismaClient();
const SUFFIX = "(demo)";
const MARKER = "Demo facility created by the development seed. Not a real parking lot.";
const M_PER_DEG = 111_320;

const lm = (name: string) => {
  const l = LANDMARKS.find((x) => x.name === name);
  if (!l) throw new Error(`Unknown landmark ${name}`);
  return l;
};
/** Offset a landmark by metres north/east. */
const near = (landmark: string, north: number, east: number) => {
  const l = lm(landmark);
  return { lat: l.lat + north / M_PER_DEG, lng: l.lng + east / (M_PER_DEG * Math.cos((l.lat * Math.PI) / 180)) };
};

interface Demo {
  name: string;
  anchor: string;
  north: number;
  east: number;
  type: FacilityType;
  model: "CAPACITY_BASED" | "INDIVIDUAL_SPACES";
  capacity: number;
  firstEtb: number;
  addEtb: number;
  covered?: boolean;
  indoor?: boolean;
  open24?: boolean;
  /** local opening hours when not 24h, "HH:MM-HH:MM" */
  hours?: string;
  features?: string[];
  /** how many units to occupy with confirmed bookings for the next 3 days */
  booked?: number;
  /** per-facility policy overrides */
  policy?: { minDurationMinutes?: number; maxDurationMinutes?: number; minAdvanceMinutes?: number; depositPercent?: number };
}

const DEMOS: Demo[] = [
  { name: "Meskel Square East Lot", anchor: "Meskel Square", north: 80, east: 150, type: "PRIVATE_OPERATOR", model: "CAPACITY_BASED", capacity: 120, firstEtb: 30, addEtb: 20, open24: true, features: ["CCTV", "SECURITY_GUARD"] },
  { name: "Meskel Square Underground", anchor: "Meskel Square", north: -250, east: -120, type: "COMMERCIAL", model: "INDIVIDUAL_SPACES", capacity: 12, firstEtb: 60, addEtb: 40, covered: true, indoor: true, hours: "06:00-22:00", features: ["CCTV", "LIGHTING", "ATTENDANT"] },
  { name: "Hyatt Visitors Parking", anchor: "Hyatt Regency Addis Ababa", north: 40, east: -60, type: "HOTEL", model: "CAPACITY_BASED", capacity: 40, firstEtb: 80, addEtb: 50, covered: true, open24: true, features: ["SECURITY_GUARD", "CCTV"] },
  { name: "Atlas Bole Lot", anchor: "Bole Atlas", north: 60, east: 40, type: "COMMERCIAL", model: "CAPACITY_BASED", capacity: 60, firstEtb: 30, addEtb: 25, open24: true, features: ["CCTV"], booked: 59 },
  { name: "Edna Mall Basement", anchor: "Edna Mall", north: -30, east: 70, type: "MALL", model: "INDIVIDUAL_SPACES", capacity: 20, firstEtb: 50, addEtb: 30, covered: true, indoor: true, hours: "08:00-21:00", features: ["CCTV", "EV_CHARGING", "LIGHTING"] },
  { name: "Bole Medhanialem Street Lot", anchor: "Bole Medhanialem", north: 120, east: -90, type: "INDIVIDUAL", model: "CAPACITY_BASED", capacity: 15, firstEtb: 20, addEtb: 15, hours: "07:00-20:00" },
  { name: "Airport Short-Stay", anchor: "Bole International Airport", north: 200, east: 100, type: "COMMERCIAL", model: "CAPACITY_BASED", capacity: 300, firstEtb: 40, addEtb: 30, open24: true, features: ["CCTV", "SECURITY_GUARD", "LIGHTING"] },
  { name: "Airport Covered Garage", anchor: "Bole International Airport", north: -150, east: -200, type: "COMMERCIAL", model: "INDIVIDUAL_SPACES", capacity: 16, firstEtb: 90, addEtb: 60, covered: true, indoor: true, open24: true, features: ["CCTV", "EV_CHARGING", "CAR_WASH"], booked: 16 },
  { name: "Piassa Municipal Lot", anchor: "Piassa", north: 70, east: 90, type: "PRIVATE_OPERATOR", model: "CAPACITY_BASED", capacity: 50, firstEtb: 15, addEtb: 10, hours: "06:00-19:00" },
  { name: "Churchill Avenue Garage", anchor: "Churchill Avenue", north: -60, east: 30, type: "OFFICE", model: "INDIVIDUAL_SPACES", capacity: 10, firstEtb: 45, addEtb: 25, covered: true, hours: "07:00-18:00", features: ["SECURITY_GUARD"], policy: { minDurationMinutes: 60, depositPercent: 30 } },
  { name: "Kazanchis Business Parking", anchor: "Kazanchis", north: 30, east: -100, type: "OFFICE", model: "CAPACITY_BASED", capacity: 80, firstEtb: 35, addEtb: 20, open24: true, features: ["CCTV", "LIGHTING"] },
  { name: "Megenagna Square Lot", anchor: "Megenagna", north: -90, east: 110, type: "PRIVATE_OPERATOR", model: "CAPACITY_BASED", capacity: 45, firstEtb: 25, addEtb: 15, open24: true },
  { name: "Mercato Market Parking", anchor: "Mercato", north: 150, east: -40, type: "PRIVATE_OPERATOR", model: "CAPACITY_BASED", capacity: 200, firstEtb: 10, addEtb: 10, hours: "06:00-20:00", booked: 190 },
  { name: "Arat Kilo Hospital Lot", anchor: "Tikur Anbessa Hospital", north: 60, east: -50, type: "HOSPITAL", model: "CAPACITY_BASED", capacity: 70, firstEtb: 20, addEtb: 10, open24: true, features: ["SECURITY_GUARD"] },
  { name: "University Visitors Lot", anchor: "Addis Ababa University (Sidist Kilo)", north: -80, east: 60, type: "UNIVERSITY", model: "CAPACITY_BASED", capacity: 60, firstEtb: 15, addEtb: 10, hours: "07:00-20:00" },
  { name: "Lideta Square Lot", anchor: "Lideta", north: 50, east: 70, type: "INDIVIDUAL", model: "CAPACITY_BASED", capacity: 25, firstEtb: 20, addEtb: 15, hours: "07:00-21:00" },
];

const parseHours = (s: string) => {
  const [a, b] = s.split("-") as [string, string];
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return { opens: m(a), closes: m(b) === 0 ? 1440 : m(b) };
};

async function remove(orgId: string) {
  const ids = (await db.parkingFacility.findMany({ where: { organizationId: orgId, name: { endsWith: SUFFIX }, description: MARKER }, select: { id: true } })).map((f) => f.id);
  if (!ids.length) return 0;
  await db.reservation.deleteMany({ where: { facilityId: { in: ids } } });
  await db.parkingFacility.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function main() {
  const org = await db.organization.findFirst({ where: { name: "Demo Parking PLC" } });
  if (!org) throw new Error("Run `npm run db:seed` first (creates the demo organisation).");
  const removed = await remove(org.id);
  if (process.argv.includes("--remove")) {
    console.log(`Removed ${removed} demo facilities.`);
    return;
  }

  await loadLandmarks(db);
  // Occupancy is booked by a separate placeholder account (cannot sign in), so the demo driver's own vehicle stays free to book with.
  const occupant = await db.user.upsert({
    where: { email: "demo-occupancy@parking.invalid" },
    update: {},
    create: { email: "demo-occupancy@parking.invalid", passwordHash: "!", role: "DRIVER", status: "ACTIVE" },
  });
  const vehicle =
    (await db.vehicle.findFirst({ where: { userId: occupant.id, deletedAt: null } })) ??
    (await db.vehicle.create({ data: { userId: occupant.id, plateNumber: "DEMO-OCCUPANT", type: "SEDAN", isDefault: true } }));

  const horizon = new Date(Date.now() + 3 * 86_400_000);
  const from = new Date(Date.now() - 3_600_000);
  let ref = 0;
  const book = (facilityId: string, spaceId: string | null) =>
    db.reservation.create({
      data: {
        reference: `DEMO-${Date.now().toString(36)}-${ref++}`, userId: occupant.id, facilityId, vehicleId: vehicle.id, vehicleType: "SEDAN",
        allocation: spaceId ? "SPACE" : "CAPACITY", spaceId, status: "ACTIVE", startAt: from, endAt: horizon, blocksInventory: true,
        estimatedFeeCents: 0, depositCents: 0, graceMinutes: 15, policySnapshot: { demo: true },
      },
    });

  for (const d of DEMOS) {
    const pos = near(d.anchor, d.north, d.east);
    const f = await db.parkingFacility.create({
      data: {
        organizationId: org.id, name: `${d.name} ${SUFFIX}`, type: d.type, status: "APPROVED",
        description: MARKER,
        address: `Near ${d.anchor}, Addis Ababa`, neighborhood: lm(d.anchor).neighborhood,
        latitude: pos.lat, longitude: pos.lng, inventoryModel: d.model, totalCapacity: d.model === "CAPACITY_BASED" ? d.capacity : 0,
        isCovered: d.covered ?? false, isIndoor: d.indoor ?? false, is24Hours: d.open24 ?? false,
        features: { create: (d.features ?? []).map((key) => ({ key })) },
        reservationPolicy: { create: { depositPercent: 20, ...d.policy } },
        cancellationPolicy: { create: {} },
        pricingRules: { create: { firstUnitCents: d.firstEtb * 100, additionalUnitCents: d.addEtb * 100, minimumChargeCents: d.firstEtb * 100 } },
        hours: d.hours
          ? { create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensMinute: parseHours(d.hours!).opens, closesMinute: parseHours(d.hours!).closes })) }
          : undefined,
      },
    });

    if (d.model === "INDIVIDUAL_SPACES") {
      const floor = await db.parkingFloor.create({ data: { facilityId: f.id, name: "Ground" } });
      const zone = await db.parkingZone.create({ data: { facilityId: f.id, floorId: floor.id, name: "A" } });
      const spaces = [];
      for (let i = 1; i <= d.capacity; i++) {
        const vehicleTypes: VehicleType[] = i % 5 === 0 ? ["MOTORCYCLE"] : ["SEDAN", "SUV"];
        spaces.push(await db.parkingSpace.create({ data: { facilityId: f.id, zoneId: zone.id, label: `A${i}`, vehicleTypes, isCovered: d.covered ?? false } }));
      }
      await db.parkingFacility.update({ where: { id: f.id }, data: { totalCapacity: spaces.length } });
      const sedanSpaces = spaces.filter((s) => s.vehicleTypes.includes("SEDAN"));
      for (const s of sedanSpaces.slice(0, d.booked ?? 0)) await book(f.id, s.id);
    } else {
      for (let i = 0; i < (d.booked ?? 0); i++) await book(f.id, null);
    }
  }
  console.log(`Created ${DEMOS.length} demo facilities (replaced ${removed}). Search e.g. "Meskel Square", "Bole Airport", "Edna Mall", "Piassa".`);
  console.log('Atlas Bole Lot (1 space left), Airport Covered Garage and Mercato (nearly) FULL are included to show availability states.');
}

main().finally(() => db.$disconnect());
