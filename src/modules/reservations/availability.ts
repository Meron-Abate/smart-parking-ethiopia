import type { Prisma, PrismaClient, VehicleType } from "@prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

export interface Interval {
  start: Date;
  end: Date;
  units: number;
}

/**
 * Highest number of units in use at any instant inside [start, end), given intervals that may extend outside it.
 * Load only changes when an interval starts, so it is enough to sample the window start and every interval start in the window.
 * (Counting every overlapping booking instead would wrongly refuse e.g. one 2-hour booking next to two back-to-back 1-hour ones.)
 */
export function peakLoad(intervals: Interval[], start: Date, end: Date): number {
  const s = start.getTime();
  const e = end.getTime();
  const relevant = intervals.filter((i) => i.start.getTime() < e && i.end.getTime() > s);
  const points = new Set<number>([s]);
  for (const i of relevant) if (i.start.getTime() > s) points.add(i.start.getTime());
  let peak = 0;
  for (const t of points) {
    let load = 0;
    for (const i of relevant) if (i.start.getTime() <= t && i.end.getTime() > t) load += i.units;
    peak = Math.max(peak, load);
  }
  return peak;
}

/** A pending hold whose time ran out no longer counts, even before the sweeper marks it expired. */
export const liveHold = (now: Date): Prisma.ReservationWhereInput => ({
  blocksInventory: true,
  NOT: { status: "PENDING_PAYMENT", holdExpiresAt: { lte: now } },
});

/** Capacity-based facility: reservations and capacity-level maintenance overlapping the window, as intervals. */
export async function capacityIntervals(tx: Tx, facilityIds: string[], start: Date, end: Date, now: Date, excludeReservationId?: string) {
  const [reservations, maintenance] = await Promise.all([
    tx.reservation.findMany({
      where: { facilityId: { in: facilityIds }, allocation: "CAPACITY", startAt: { lt: end }, endAt: { gt: start }, ...liveHold(now), ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}) },
      select: { facilityId: true, startAt: true, endAt: true },
    }),
    tx.maintenanceRecord.findMany({
      where: { facilityId: { in: facilityIds }, spaceId: null, startAt: { lt: end }, endAt: { gt: start } },
      select: { facilityId: true, startAt: true, endAt: true, units: true },
    }),
  ]);
  const byFacility = new Map<string, Interval[]>();
  const push = (id: string, i: Interval) => byFacility.set(id, [...(byFacility.get(id) ?? []), i]);
  for (const r of reservations) push(r.facilityId, { start: r.startAt, end: r.endAt, units: 1 });
  for (const m of maintenance) push(m.facilityId, { start: m.startAt, end: m.endAt, units: m.units });
  return byFacility;
}

/** Units still free for the WHOLE window at a capacity-based facility. */
export async function capacityFree(tx: Tx, facilityId: string, totalCapacity: number, start: Date, end: Date, now: Date, excludeReservationId?: string): Promise<number> {
  const map = await capacityIntervals(tx, [facilityId], start, end, now, excludeReservationId);
  return Math.max(0, totalCapacity - peakLoad(map.get(facilityId) ?? [], start, end));
}

/** Free, compatible individual spaces for the whole window, ordered by label. */
export async function freeSpaces(tx: Tx, facilityId: string, vehicleType: VehicleType, start: Date, end: Date, now: Date, opts: { onlySpaceId?: string; limit?: number } = {}) {
  const only = opts.onlySpaceId ?? null;
  const rows = await tx.$queryRaw<{ id: string; label: string }[]>`
    SELECT s.id, s.label FROM "ParkingSpace" s
    WHERE s."facilityId" = ${facilityId}
      AND s.status = 'AVAILABLE'
      AND ${vehicleType}::"VehicleType" = ANY(s."vehicleTypes")
      AND (${only}::text IS NULL OR s.id = ${only})
      AND NOT EXISTS (SELECT 1 FROM "Reservation" r WHERE r."spaceId" = s.id AND r."blocksInventory"
                      AND NOT (r.status = 'PENDING_PAYMENT' AND r."holdExpiresAt" <= ${now}::timestamptz)
                      AND tstzrange(r."startAt", r."endAt", '[)') && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)'))
      AND NOT EXISTS (SELECT 1 FROM "MaintenanceRecord" m WHERE m."spaceId" = s.id
                      AND tstzrange(m."startAt", m."endAt", '[)') && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)'))
    ORDER BY s.label
    LIMIT ${opts.limit ?? 1000}`;
  return rows;
}
