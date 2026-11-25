import { db } from "@/platform/db";
import { AppError } from "@/platform/errors";
import { router } from "@/modules/geo";
import { estimateFeeCents, selectRule } from "@/modules/pricing/calculate";
import { capacityIntervals, peakLoad } from "@/modules/reservations/availability";
import { hoursLabel } from "./hours";
import { checkBookingRules } from "./rules";
import type { DiscoverInput } from "./schemas";

export type AvailabilityStatus = "AVAILABLE" | "LIMITED" | "FULL" | "CLOSED" | "NOT_BOOKABLE" | "NO_PRICE";

export interface DiscoveredFacility {
  id: string;
  name: string;
  type: string;
  address: string;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  walk: { meters: number; minutes: number; source: "estimate" | "routed" };
  status: AvailabilityStatus;
  bookable: boolean;
  /** Human reason when not bookable. */
  reason: string | null;
  /** Units free for the whole requested window; null when not evaluated (closed / not bookable by policy). */
  availableUnits: number | null;
  totalCapacity: number;
  estimatedFeeCents: number | null;
  unit: "HOURLY" | "DAILY" | null;
  firstUnitCents: number | null;
  depositPercent: number;
  hoursToday: string;
  isCovered: boolean;
  isIndoor: boolean;
  is24Hours: boolean;
  features: string[];
  inventoryModel: "INDIVIDUAL_SPACES" | "CAPACITY_BASED";
}

export interface DiscoverResult {
  facilities: DiscoveredFacility[];
  meta: {
    destination: { latitude: number; longitude: number; name: string | null };
    radiusMeters: number;
    arrivalAt: string;
    endAt: string;
    durationMinutes: number;
    vehicleType: string;
    total: number;
    hiddenUnavailable: number;
    walkingSource: string;
  };
}

const ROUND_MS = 15 * 60_000;
const MAX_CANDIDATES = 100;
const MAX_PAST_SKEW_MS = 5 * 60_000;

/** Default arrival: now rounded up to the next quarter hour. */
export const defaultArrival = (now: Date): Date => new Date(Math.ceil(now.getTime() / ROUND_MS) * ROUND_MS);

/**
 * Destination-based discovery. The search centre is the DESTINATION coordinates passed in `input`;
 * the driver's own location is never an input. `now` is injectable for tests.
 */
export async function discover(input: DiscoverInput, now: Date = new Date()): Promise<DiscoverResult> {
  const start = input.arrivalAt ? new Date(input.arrivalAt) : defaultArrival(now);
  if (start.getTime() < now.getTime() - MAX_PAST_SKEW_MS) {
    throw new AppError("VALIDATION_ERROR", "Arrival time is in the past.", { fieldErrors: { arrivalAt: ["Arrival time is in the past."] } });
  }
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const dest = { latitude: input.lat, longitude: input.lng };

  // 1. Candidates by geography (PostGIS, uses the GiST index). Centre = destination.
  const near = await db.$queryRaw<{ id: string; distance: number }[]>`
    SELECT f.id, ST_Distance(f.location, p.pt) AS distance
    FROM "ParkingFacility" f,
         (SELECT ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography AS pt) p
    WHERE f.status = 'APPROVED' AND f.location IS NOT NULL AND ST_DWithin(f.location, p.pt, ${input.radius})
    ORDER BY distance
    LIMIT ${MAX_CANDIDATES}`;
  const distanceById = new Map(near.map((r) => [r.id, Number(r.distance)]));
  const ids = near.map((r) => r.id);

  const meta = {
    destination: { ...dest, name: input.destinationName ?? null },
    radiusMeters: input.radius,
    arrivalAt: start.toISOString(),
    endAt: end.toISOString(),
    durationMinutes: input.durationMinutes,
    vehicleType: input.vehicleType,
    walkingSource: router.name,
  };
  if (ids.length === 0) return { facilities: [], meta: { ...meta, total: 0, hiddenUnavailable: 0 } };

  // 2. Free units per facility for the whole window (conflicting reservations + maintenance excluded).
  const [spaceRows, capIntervals, rows] = await Promise.all([
    db.$queryRaw<{ facilityId: string; free: bigint }[]>`
      SELECT s."facilityId", count(*) AS free
      FROM "ParkingSpace" s
      WHERE s."facilityId" = ANY(${ids}::text[])
        AND s.status = 'AVAILABLE'
        AND ${input.vehicleType}::"VehicleType" = ANY(s."vehicleTypes")
        AND NOT EXISTS (SELECT 1 FROM "Reservation" r WHERE r."spaceId" = s.id AND r."blocksInventory" AND NOT (r.status = 'PENDING_PAYMENT' AND r."holdExpiresAt" <= ${now}::timestamptz)
                        AND tstzrange(r."startAt", r."endAt", '[)') && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)'))
        AND NOT EXISTS (SELECT 1 FROM "MaintenanceRecord" m WHERE m."spaceId" = s.id
                        AND tstzrange(m."startAt", m."endAt", '[)') && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)'))
      GROUP BY s."facilityId"`,
    capacityIntervals(db, ids, start, end, now),
    db.parkingFacility.findMany({
      where: { id: { in: ids } },
      include: { hours: true, features: true, pricingRules: true, reservationPolicy: true },
    }),
  ]);
  const free = new Map<string, number>();
  for (const r of spaceRows) free.set(r.facilityId, Number(r.free));
  for (const f of rows) if (f.inventoryModel === "CAPACITY_BASED") free.set(f.id, Math.max(0, f.totalCapacity - peakLoad(capIntervals.get(f.id) ?? [], start, end)));

  // 3. Evaluate each candidate.
  const out: DiscoveredFacility[] = [];
  for (const f of rows) {
    const distanceMeters = Math.round(distanceById.get(f.id) ?? 0);
    const policy = f.reservationPolicy;
    const check = checkBookingRules(f, input.vehicleType, start, input.durationMinutes, now);
    const rule = selectRule(f.pricingRules, input.vehicleType);

    let status: AvailabilityStatus;
    let reason: string | null = null;
    let availableUnits: number | null = null;

    if (!check.ok) {
      status = check.status;
      reason = check.reason;
    } else {
      availableUnits = free.get(f.id) ?? 0;
      const limitedAt = Math.max(3, Math.ceil(f.totalCapacity * 0.15));
      status = availableUnits <= 0 ? "FULL" : availableUnits <= limitedAt ? "LIMITED" : "AVAILABLE";
      if (status === "FULL") reason = "No space free for your whole stay.";
    }

    const bookable = status === "AVAILABLE" || status === "LIMITED";
    const estimatedFeeCents = rule ? estimateFeeCents(rule, input.durationMinutes) : null;

    // filters
    if (input.covered && !f.isCovered) continue;
    if (input.indoor && !f.isIndoor) continue;
    if (input.open24 && !f.is24Hours) continue;
    if (input.features.length && !input.features.every((k) => f.features.some((x) => x.key === k))) continue;
    if (input.maxPriceCents != null && (estimatedFeeCents == null || estimatedFeeCents > input.maxPriceCents)) continue;

    out.push({
      id: f.id, name: f.name, type: f.type, address: f.address, neighborhood: f.neighborhood,
      latitude: f.latitude, longitude: f.longitude, distanceMeters,
      walk: await router.walkFromParkingToDestination(f, dest),
      status, bookable, reason, availableUnits, totalCapacity: f.totalCapacity,
      estimatedFeeCents, unit: rule?.unit ?? null, firstUnitCents: rule?.firstUnitCents ?? null,
      depositPercent: policy?.depositPercent ?? 0,
      hoursToday: hoursLabel(f.is24Hours, f.hours, start),
      isCovered: f.isCovered, isIndoor: f.isIndoor, is24Hours: f.is24Hours,
      features: f.features.map((x) => x.key), inventoryModel: f.inventoryModel,
    });
  }

  const visible = input.showUnavailable ? out : out.filter((x) => x.bookable);
  const byDistance = (a: DiscoveredFacility, b: DiscoveredFacility) => a.distanceMeters - b.distanceMeters;
  visible.sort((a, b) => {
    // bookable facilities always come before unavailable ones when both are shown
    if (a.bookable !== b.bookable) return a.bookable ? -1 : 1;
    if (input.sort === "price") return (a.estimatedFeeCents ?? Infinity) - (b.estimatedFeeCents ?? Infinity) || byDistance(a, b);
    if (input.sort === "availability") return (b.availableUnits ?? -1) - (a.availableUnits ?? -1) || byDistance(a, b);
    return byDistance(a, b);
  });

  return { facilities: visible, meta: { ...meta, total: visible.length, hiddenUnavailable: out.length - visible.length } };
}
