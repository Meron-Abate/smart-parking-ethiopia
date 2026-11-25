import { randomInt } from "node:crypto";
import type { Prisma, VehicleType } from "@prisma/client";
import { db } from "@/platform/db";
import { AppError } from "@/platform/errors";
import { percentOf } from "@/platform/money";
import { audit } from "@/modules/audit/service";
import { getNumberSetting } from "@/modules/settings/service";
import { checkBookingRules } from "@/modules/discovery/rules";
import { isOpenForWindow } from "@/modules/discovery/hours";
import { estimateFeeCents, type PricingRuleLike } from "@/modules/pricing/calculate";
import { capacityFree, capacityIntervals, freeSpaces, liveHold, peakLoad } from "./availability";
import { applyReservationAction } from "./transitions";
import type { CreateReservationInput } from "./schemas";

export interface Actor {
  id: string;
  role: string;
}

const MAX_OPEN_HOLDS = 3;
const PAST_SKEW_MS = 5 * 60_000;
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

const newReference = () => "SP-" + Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("");
const validation = (message: string, field?: string) => new AppError("VALIDATION_ERROR", message, field ? { fieldErrors: { [field]: [message] } } : undefined);

/** Postgres exclusion-constraint violation (SQLSTATE 23P01), however Prisma surfaces it. */
export const isExclusionViolation = (e: unknown): boolean => {
  const m = String((e as { message?: string })?.message ?? "");
  const code = (e as { meta?: { code?: string }; code?: string })?.meta?.code ?? (e as { code?: string })?.code;
  return code === "23P01" || m.includes("23P01") || m.includes("Reservation_no_space_overlap") || m.includes("exclusion constraint");
};

export const holdMinutes = () => getNumberSetting("hold.minutes", 10);

// ────────────────────────── background-style maintenance (also called lazily) ──────────────────────────

/**
 * Releases inventory that nobody is using any more. Safe to call at any time and from many processes at once
 * (every statement is conditional). Called lazily before reservation reads/writes and by `npm run job:sweep`.
 *  1. unpaid reservation holds past their deadline -> EXPIRED
 *  2. unpaid extension holds past their deadline   -> reservation end reverted, extension EXPIRED
 *  3. confirmed reservations whose grace period passed without arrival -> NO_SHOW
 */
export async function sweep(now: Date = new Date()): Promise<{ expiredHolds: number; expiredExtensions: number; noShows: number }> {
  const expiredHolds = (
    await db.reservation.updateMany({
      where: { status: "PENDING_PAYMENT", holdExpiresAt: { lte: now } },
      data: { status: "EXPIRED", blocksInventory: false },
    })
  ).count;

  let expiredExtensions = 0;
  const stale = await db.reservationExtension.findMany({ where: { status: "PENDING_PAYMENT", holdExpiresAt: { lte: now } } });
  for (const ext of stale) {
    const reverted = await db.$transaction(async (tx) => {
      const claimed = await tx.reservationExtension.updateMany({ where: { id: ext.id, status: "PENDING_PAYMENT" }, data: { status: "EXPIRED" } });
      if (claimed.count === 0) return false; // someone else handled it
      await tx.reservation.updateMany({
        where: { id: ext.reservationId, endAt: ext.newEndAt },
        data: { endAt: ext.previousEndAt, estimatedFeeCents: { decrement: ext.additionalFeeCents } },
      });
      return true;
    });
    if (reverted) expiredExtensions++;
  }

  const noShows = await db.$executeRaw`
    UPDATE "Reservation" SET status = 'NO_SHOW'::"ReservationStatus", "blocksInventory" = false, "updatedAt" = now()
    WHERE status = 'CONFIRMED'::"ReservationStatus" AND "startAt" + ("graceMinutes" * interval '1 minute') < ${now}::timestamptz`;

  if (expiredHolds + expiredExtensions + noShows > 0) {
    await audit({ action: "reservation.sweep", metadata: { expiredHolds, expiredExtensions, noShows } });
  }
  return { expiredHolds, expiredExtensions, noShows };
}

// ────────────────────────── create ──────────────────────────

export async function createReservation(actor: Actor, input: CreateReservationInput, now: Date = new Date(), ip?: string | null) {
  await sweep(now);
  const start = new Date(input.startAt);
  if (start.getTime() < now.getTime() - PAST_SKEW_MS) throw validation("Arrival time is in the past.", "startAt");
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  const vehicle = await db.vehicle.findFirst({ where: { id: input.vehicleId, userId: actor.id, deletedAt: null } });
  if (!vehicle) throw new AppError("NOT_FOUND", "Vehicle not found.");
  const f = await db.parkingFacility.findUnique({
    where: { id: input.facilityId },
    include: { hours: true, pricingRules: true, reservationPolicy: true, cancellationPolicy: true },
  });
  if (!f || f.status !== "APPROVED") throw new AppError("NOT_FOUND", "This parking facility is not accepting reservations.");

  const check = checkBookingRules(f, vehicle.type, start, input.durationMinutes, now);
  if (!check.ok) throw validation(check.reason, check.status === "NOT_BOOKABLE" ? "durationMinutes" : "startAt");
  const rule = check.rule;
  if (input.spaceId && f.inventoryModel !== "INDIVIDUAL_SPACES") throw validation("This facility does not offer numbered spaces.", "spaceId");

  // per-driver limits
  const openHolds = await db.reservation.count({ where: { userId: actor.id, status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } } });
  if (openHolds >= MAX_OPEN_HOLDS) throw new AppError("CONFLICT", `You already have ${MAX_OPEN_HOLDS} unpaid holds. Pay for or cancel one first.`);
  const clash = await db.reservation.findFirst({ where: { vehicleId: vehicle.id, startAt: { lt: end }, endAt: { gt: start }, ...liveHold(now) } });
  if (clash) throw new AppError("CONFLICT", "This vehicle already has a reservation that overlaps this time.");

  const fee = estimateFeeCents(rule, input.durationMinutes);
  const deposit = percentOf(fee, f.reservationPolicy?.depositPercent ?? 20);
  const holdMs = (await holdMinutes()) * 60_000;
  const snapshot = {
    pricingRule: rule,
    reservation: f.reservationPolicy,
    cancellation: f.cancellationPolicy,
    pricedAt: now.toISOString(),
  } as unknown as Prisma.InputJsonValue;

  const baseData = (spaceId: string | null) =>
    ({
      userId: actor.id, facilityId: f.id, vehicleId: vehicle.id, vehicleType: vehicle.type,
      allocation: spaceId ? "SPACE" : "CAPACITY", spaceId,
      status: "PENDING_PAYMENT", blocksInventory: true,
      startAt: start, endAt: end, holdExpiresAt: new Date(now.getTime() + holdMs),
      destinationName: input.destination?.name ?? null, destinationLat: input.destination?.latitude ?? null, destinationLng: input.destination?.longitude ?? null,
      estimatedFeeCents: fee, depositCents: deposit, graceMinutes: f.reservationPolicy?.graceMinutes ?? 15,
      policySnapshot: snapshot,
    }) satisfies Omit<Prisma.ReservationUncheckedCreateInput, "reference">;

  // reference collisions are astronomically unlikely, but the column is unique, so retry a few times
  const insert = async (tx: Prisma.TransactionClient | typeof db, spaceId: string | null) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await tx.reservation.create({ data: { ...baseData(spaceId), reference: newReference() } });
      } catch (e) {
        if (attempt < 3 && String((e as Error).message).includes("reference")) continue;
        throw e;
      }
    }
  };

  let reservation;
  if (f.inventoryModel === "INDIVIDUAL_SPACES") {
    // The database exclusion constraint is the real guard: if two drivers pick the same space for overlapping
    // times, exactly one insert wins and the loser moves on to the next candidate (or fails cleanly).
    const candidates = await freeSpaces(db, f.id, vehicle.type, start, end, now, { onlySpaceId: input.spaceId, limit: 15 });
    if (candidates.length === 0) {
      throw new AppError("CONFLICT", input.spaceId ? "That space is not available for your time." : "No space is available for your time.");
    }
    for (const c of candidates) {
      try {
        reservation = await insert(db, c.id);
        break;
      } catch (e) {
        if (isExclusionViolation(e)) {
          if (input.spaceId) throw new AppError("CONFLICT", "That space was just taken. Please choose another.");
          continue;
        }
        throw e;
      }
    }
    if (!reservation) throw new AppError("CONFLICT", "The last space was just taken. Please try a different time or facility.");
  } else {
    // Capacity-based: serialise concurrent bookings per facility with an advisory lock, then check peak load.
    reservation = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.id}))`;
        const free = await capacityFree(tx, f.id, f.totalCapacity, start, end, now);
        if (free < 1) throw new AppError("CONFLICT", "This facility is full for your time.");
        return insert(tx, null);
      },
      { timeout: 15_000 },
    );
  }

  await audit({ action: "reservation.create", actorId: actor.id, entityType: "Reservation", entityId: reservation.id, ip, metadata: { reference: reservation.reference, facilityId: f.id, estimatedFeeCents: fee } });
  return reservation;
}

// ────────────────────────── read ──────────────────────────

const detailInclude = {
  facility: { select: { id: true, name: true, address: true, neighborhood: true, latitude: true, longitude: true, contactPhone: true } },
  space: { select: { label: true } },
  vehicle: { select: { plateNumber: true, type: true } },
  extensions: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ReservationInclude;

export async function listMyReservations(actor: Actor, scope: "upcoming" | "past" | "all", now: Date = new Date()) {
  await sweep(now);
  const upcoming: Prisma.ReservationWhereInput = { status: { in: ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "ACTIVE", "EXTENSION_PENDING"] } };
  return db.reservation.findMany({
    where: { userId: actor.id, ...(scope === "upcoming" ? upcoming : scope === "past" ? { NOT: upcoming } : {}) },
    include: detailInclude,
    orderBy: { startAt: scope === "past" ? "desc" : "asc" },
    take: 100,
  });
}

/** Another driver's reservation is reported as NOT_FOUND, not FORBIDDEN, so ids cannot be probed. */
export async function getMyReservation(actor: Actor, id: string, now: Date = new Date()) {
  await sweep(now);
  const r = await db.reservation.findFirst({ where: { id, userId: actor.id }, include: detailInclude });
  if (!r) throw new AppError("NOT_FOUND", "Reservation not found.");
  return r;
}

// ────────────────────────── confirm / cancel ──────────────────────────

/**
 * Moves a held reservation to CONFIRMED. Called by the payment flow once the deposit is settled (Phase 5),
 * and by the development-only simulate-payment endpoint. Refuses (and expires it) if the hold ran out.
 */
export async function confirmReservation(id: string, now: Date = new Date(), actor?: Actor) {
  const outcome = await db.$transaction(async (tx) => {
    const r = await tx.reservation.findUnique({ where: { id } });
    if (!r || (actor && r.userId !== actor.id)) throw new AppError("NOT_FOUND", "Reservation not found.");
    if (r.status === "PENDING_PAYMENT" && r.holdExpiresAt && r.holdExpiresAt <= now) return { expired: true as const };
    const next = applyReservationAction(r.status, "confirm");
    return { expired: false as const, reservation: await tx.reservation.update({ where: { id }, data: { ...next, holdExpiresAt: null } }) };
  });
  if (outcome.expired) {
    // committed separately: throwing inside the transaction above would have rolled the expiry back
    await sweep(now);
    throw new AppError("CONFLICT", "Your hold expired before payment. Please search again.");
  }
  return outcome.reservation;
}

/** Refund the driver is owed on cancellation, from the policy snapshot taken at booking time. */
export function cancellationRefundCents(r: { status: string; startAt: Date; depositCents: number; policySnapshot: unknown }, now: Date): number {
  if (r.status !== "CONFIRMED") return 0; // nothing has been paid for an unpaid hold
  const c = ((r.policySnapshot as { cancellation?: { freeCancelBeforeMinutes: number; refundPercentBefore: number; refundPercentAfter: number } } | null)?.cancellation) ?? null;
  if (!c) return 0;
  const free = now.getTime() <= r.startAt.getTime() - c.freeCancelBeforeMinutes * 60_000;
  return percentOf(r.depositCents, free ? c.refundPercentBefore : c.refundPercentAfter);
}

export async function cancelReservation(actor: Actor, id: string, now: Date = new Date(), ip?: string | null) {
  const out = await db.$transaction(async (tx) => {
    const r = await tx.reservation.findFirst({ where: { id, userId: actor.id } });
    if (!r) throw new AppError("NOT_FOUND", "Reservation not found.");
    if (r.endAt <= now) throw new AppError("CONFLICT", "This reservation has already ended.");
    const next = applyReservationAction(r.status, "cancel");
    const refundDueCents = cancellationRefundCents(r, now);
    await tx.reservation.update({ where: { id }, data: { ...next, holdExpiresAt: null, cancelledAt: now, cancelReason: "Cancelled by driver" } });
    await tx.reservationExtension.updateMany({ where: { reservationId: id, status: "PENDING_PAYMENT" }, data: { status: "REJECTED" } });
    return { id, status: next.status, refundDueCents };
  });
  await audit({ action: "reservation.cancel", actorId: actor.id, entityType: "Reservation", entityId: id, ip, metadata: { refundDueCents: out.refundDueCents } });
  return out; // Phase 5 turns refundDueCents into an actual refund
}

// ────────────────────────── extension ──────────────────────────

export async function requestExtension(actor: Actor, id: string, extraMinutes: number, now: Date = new Date(), ip?: string | null) {
  await sweep(now);
  const holdMs = (await holdMinutes()) * 60_000;
  const result = await db.$transaction(async (tx) => {
    const r = await tx.reservation.findFirst({ where: { id, userId: actor.id }, include: { facility: { include: { hours: true, reservationPolicy: true } } } });
    if (!r) throw new AppError("NOT_FOUND", "Reservation not found.");
    if (!["CONFIRMED", "CHECKED_IN", "ACTIVE"].includes(r.status)) throw new AppError("CONFLICT", "Only a confirmed or active reservation can be extended.");
    const policy = r.facility.reservationPolicy;
    if (policy && !policy.allowExtensions) throw new AppError("CONFLICT", "This facility does not allow extensions.");
    const graceMs = policy?.allowGraceExtension ? policy.extensionGraceMinutes * 60_000 : 0;
    if (now.getTime() > r.endAt.getTime() + graceMs) throw new AppError("CONFLICT", "This reservation has already ended.");
    if (await tx.reservationExtension.findFirst({ where: { reservationId: id, status: "PENDING_PAYMENT" } })) {
      throw new AppError("CONFLICT", "You already have an extension waiting for payment.");
    }

    const prevEnd = r.endAt;
    const newEnd = new Date(prevEnd.getTime() + extraMinutes * 60_000);
    const totalMinutes = Math.round((newEnd.getTime() - r.startAt.getTime()) / 60_000);
    if (policy && totalMinutes > policy.maxDurationMinutes) throw validation(`Total stay cannot exceed ${policy.maxDurationMinutes} minutes at this facility.`, "extraMinutes");
    if (!isOpenForWindow(r.facility.is24Hours, r.facility.hours, prevEnd, newEnd)) throw new AppError("CONFLICT", "The facility is closed for part of the extra time.");

    // price stays as quoted at booking time (snapshot), so a later price change cannot surprise the driver
    const rule = (r.policySnapshot as { pricingRule?: PricingRuleLike } | null)?.pricingRule;
    if (!rule) throw new AppError("CONFLICT", "This reservation cannot be extended automatically.");
    const additional = Math.max(0, estimateFeeCents(rule, totalMinutes) - estimateFeeCents(rule, Math.round((prevEnd.getTime() - r.startAt.getTime()) / 60_000)));

    if (r.allocation === "SPACE") {
      const maint = await tx.maintenanceRecord.count({ where: { spaceId: r.spaceId!, startAt: { lt: newEnd }, endAt: { gt: prevEnd } } });
      if (maint > 0) throw new AppError("CONFLICT", "The space is not available for the extra time.");
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${r.facilityId}))`;
      const map = await capacityIntervals(tx, [r.facilityId], prevEnd, newEnd, now, r.id);
      if (peakLoad(map.get(r.facilityId) ?? [], prevEnd, newEnd) >= r.facility.totalCapacity) throw new AppError("CONFLICT", "The facility is full for the extra time.");
    }

    // Extending the row re-runs the database exclusion constraint for space bookings.
    await tx.reservation.update({ where: { id }, data: { endAt: newEnd, estimatedFeeCents: { increment: additional } } });
    const ext = await tx.reservationExtension.create({
      data: { reservationId: id, previousEndAt: prevEnd, newEndAt: newEnd, additionalFeeCents: additional, status: "PENDING_PAYMENT", holdExpiresAt: new Date(now.getTime() + holdMs) },
    });
    return ext;
  }).catch((e) => {
    if (isExclusionViolation(e)) throw new AppError("CONFLICT", "The space is already booked for the extra time.");
    throw e;
  });
  await audit({ action: "reservation.extend", actorId: actor.id, entityType: "Reservation", entityId: id, ip, metadata: { extraMinutes, additionalFeeCents: result.additionalFeeCents } });
  return result;
}

/** Settles a pending extension (called by the payment flow in Phase 5 and the development-only simulator). */
export async function confirmExtension(actor: Actor | undefined, extensionId: string, now: Date = new Date()) {
  return db.$transaction(async (tx) => {
    const ext = await tx.reservationExtension.findUnique({ where: { id: extensionId }, include: { reservation: true } });
    if (!ext || (actor && ext.reservation.userId !== actor.id)) throw new AppError("NOT_FOUND", "Extension not found.");
    if (ext.status !== "PENDING_PAYMENT") throw new AppError("CONFLICT", `This extension is ${ext.status.toLowerCase().replace(/_/g, " ")}.`);
    if (ext.holdExpiresAt && ext.holdExpiresAt <= now) throw new AppError("CONFLICT", "The extension hold expired.");
    return tx.reservationExtension.update({ where: { id: extensionId }, data: { status: "CONFIRMED", holdExpiresAt: null } });
  });
}

// ────────────────────────── quote (for the reserve page) ──────────────────────────

export async function quoteReservation(facilityId: string, startAt: Date, durationMinutes: number, vehicleType: VehicleType, now: Date = new Date()) {
  await sweep(now);
  const f = await db.parkingFacility.findUnique({
    where: { id: facilityId },
    include: { hours: true, pricingRules: true, reservationPolicy: true, cancellationPolicy: true, features: true },
  });
  if (!f || f.status !== "APPROVED") throw new AppError("NOT_FOUND", "This parking facility is not accepting reservations.");
  const end = new Date(startAt.getTime() + durationMinutes * 60_000);
  const check = checkBookingRules(f, vehicleType, startAt, durationMinutes, now);
  let availableUnits: number | null = null;
  let feeCents: number | null = null;
  let depositCents: number | null = null;
  if (check.ok) {
    feeCents = estimateFeeCents(check.rule, durationMinutes);
    depositCents = percentOf(feeCents, f.reservationPolicy?.depositPercent ?? 20);
    availableUnits =
      f.inventoryModel === "CAPACITY_BASED"
        ? await capacityFree(db, f.id, f.totalCapacity, startAt, end, now)
        : (await freeSpaces(db, f.id, vehicleType, startAt, end, now)).length;
  }
  return {
    facility: { id: f.id, name: f.name, address: f.address, neighborhood: f.neighborhood, inventoryModel: f.inventoryModel, isCovered: f.isCovered, features: f.features.map((x) => x.key) },
    startAt: startAt.toISOString(), endAt: end.toISOString(), durationMinutes, vehicleType,
    bookable: check.ok && (availableUnits ?? 0) > 0,
    reason: check.ok ? ((availableUnits ?? 0) > 0 ? null : "No space is free for your whole stay.") : check.reason,
    feeCents, depositCents, availableUnits,
    graceMinutes: f.reservationPolicy?.graceMinutes ?? 15,
    reservationPolicy: f.reservationPolicy, cancellationPolicy: f.cancellationPolicy,
    holdMinutes: await holdMinutes(),
  };
}
