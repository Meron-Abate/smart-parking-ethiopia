import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/platform/db";
import { AppError, forbidden } from "@/platform/errors";
import { pageArgs, pageMeta } from "@/platform/pagination";
import { audit } from "@/modules/audit/service";
import { assertFacilityAccess, assertOrganizationAccess, type Actor } from "@/modules/rbac/scope";
import { depositLimits } from "@/modules/settings/service";
import { nextFacilityStatus, type FacilityAction } from "./transitions";
import { facilityUpdateSchema } from "./schemas";
import type {
  facilityCreateSchema,
  facilityListQuery,
  hoursSchema,
  pricingRulesSchema,
  policiesSchema,
} from "./schemas";

const assertAdminRole = (a: Actor) => {
  if (a.role !== "FACILITY_ADMIN" && a.role !== "SUPER_ADMIN") throw forbidden();
};

async function resolveOrganizationId(actor: Actor, requested?: string): Promise<string> {
  if (requested) {
    await assertOrganizationAccess(db, actor, requested);
    return requested;
  }
  const memberships = await db.organizationMember.findMany({ where: { userId: actor.id }, select: { organizationId: true } });
  if (memberships.length === 1) return memberships[0]!.organizationId;
  throw new AppError("VALIDATION_ERROR", memberships.length ? "Specify organizationId." : "You do not belong to an organization.");
}

export async function createFacility(actor: Actor, input: z.infer<typeof facilityCreateSchema>, ip?: string | null) {
  assertAdminRole(actor);
  const organizationId = await resolveOrganizationId(actor, input.organizationId);
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (org.status !== "ACTIVE") throw new AppError("CONFLICT", "This organization is not active.");

  const { features, organizationId: _ignored, ...data } = input;
  const facility = await db.parkingFacility.create({
    data: {
      ...data,
      organizationId,
      status: "PENDING_APPROVAL",
      // individual-space facilities start at 0 and grow with each space added
      totalCapacity: input.inventoryModel === "CAPACITY_BASED" ? input.totalCapacity : 0,
      features: { create: features.map((key) => ({ key })) },
      reservationPolicy: { create: {} },
      cancellationPolicy: { create: {} },
    },
  });
  await audit({ action: "facility.create", actorId: actor.id, actorRole: actor.role, entityType: "ParkingFacility", entityId: facility.id, ip });
  return facility;
}

export async function listFacilities(actor: Actor, q: z.infer<typeof facilityListQuery>) {
  assertAdminRole(actor);
  const where: Prisma.ParkingFacilityWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(actor.role === "SUPER_ADMIN" ? {} : { organization: { members: { some: { userId: actor.id } } } }),
  };
  const [rows, total] = await Promise.all([
    db.parkingFacility.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...pageArgs(q),
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        address: true,
        neighborhood: true,
        inventoryModel: true,
        totalCapacity: true,
        createdAt: true,
        rejectionReason: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    db.parkingFacility.count({ where }),
  ]);
  return { rows, meta: pageMeta(q, total) };
}

export async function getFacility(actor: Actor, id: string) {
  assertAdminRole(actor);
  await assertFacilityAccess(db, actor, id);
  return db.parkingFacility.findUniqueOrThrow({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      features: true,
      hours: { orderBy: { dayOfWeek: "asc" } },
      pricingRules: { orderBy: { priority: "desc" } },
      reservationPolicy: true,
      cancellationPolicy: true,
      floors: {
        orderBy: { level: "asc" },
        include: { zones: { orderBy: { name: "asc" }, include: { spaces: { orderBy: { label: "asc" } } } } },
      },
    },
  });
}

export async function updateFacility(actor: Actor, id: string, input: z.infer<typeof facilityUpdateSchema>, ip?: string | null) {
  assertAdminRole(actor);
  // Re-parse so only whitelisted fields can ever reach the database, even if a caller skipped route validation.
  const patch = facilityUpdateSchema.parse(input);
  await assertFacilityAccess(db, actor, id);
  const current = await db.parkingFacility.findUniqueOrThrow({ where: { id } });
  if (current.status === "SUSPENDED") throw new AppError("CONFLICT", "A suspended facility cannot be edited. Contact support.");

  const { features, totalCapacity, ...rest } = patch;
  if (totalCapacity !== undefined && current.inventoryModel === "INDIVIDUAL_SPACES") {
    throw new AppError("VALIDATION_ERROR", "Capacity of an individual-space facility equals its number of spaces.");
  }
  // Editing a rejected facility is how an operator resubmits it for review.
  const status = current.status === "REJECTED" ? nextFacilityStatus(current.status, "resubmit") : undefined;

  const updated = await db.$transaction(async (tx) => {
    if (features) {
      await tx.facilityFeature.deleteMany({ where: { facilityId: id } });
      await tx.facilityFeature.createMany({ data: features.map((key) => ({ facilityId: id, key })) });
    }
    return tx.parkingFacility.update({
      where: { id },
      data: { ...rest, ...(totalCapacity !== undefined ? { totalCapacity } : {}), ...(status ? { status, rejectionReason: null } : {}) },
    });
  });
  await audit({ action: "facility.update", actorId: actor.id, actorRole: actor.role, entityType: "ParkingFacility", entityId: id, metadata: { fields: Object.keys(patch) }, ip });
  return updated;
}

export async function setOperatingHours(actor: Actor, id: string, rows: z.infer<typeof hoursSchema>) {
  assertAdminRole(actor);
  await assertFacilityAccess(db, actor, id);
  await db.$transaction([
    db.facilityOperatingHours.deleteMany({ where: { facilityId: id } }),
    db.facilityOperatingHours.createMany({ data: rows.map((r) => ({ ...r, facilityId: id })) }),
  ]);
  await audit({ action: "facility.hours", actorId: actor.id, actorRole: actor.role, entityType: "ParkingFacility", entityId: id });
  return db.facilityOperatingHours.findMany({ where: { facilityId: id }, orderBy: { dayOfWeek: "asc" } });
}

export async function setPricingRules(actor: Actor, id: string, rules: z.infer<typeof pricingRulesSchema>) {
  assertAdminRole(actor);
  await assertFacilityAccess(db, actor, id);
  await db.$transaction([
    db.pricingRule.deleteMany({ where: { facilityId: id } }),
    db.pricingRule.createMany({ data: rules.map((r, i) => ({ ...r, facilityId: id, priority: rules.length - i })) }),
  ]);
  await audit({ action: "facility.pricing", actorId: actor.id, actorRole: actor.role, entityType: "ParkingFacility", entityId: id, metadata: { rules: rules.length } });
  return db.pricingRule.findMany({ where: { facilityId: id }, orderBy: { priority: "desc" } });
}

export async function setPolicies(actor: Actor, id: string, input: z.infer<typeof policiesSchema>) {
  assertAdminRole(actor);
  await assertFacilityAccess(db, actor, id);
  const { min, max } = await depositLimits();
  if (input.reservation.depositPercent < min || input.reservation.depositPercent > max) {
    throw new AppError("VALIDATION_ERROR", `Deposit must be between ${min}% and ${max}% (platform limits).`, {
      fieldErrors: { "reservation.depositPercent": [`Must be between ${min} and ${max}`] },
    });
  }
  const [reservation, cancellation] = await db.$transaction([
    db.reservationPolicy.upsert({ where: { facilityId: id }, update: input.reservation, create: { facilityId: id, ...input.reservation } }),
    db.cancellationPolicy.upsert({ where: { facilityId: id }, update: input.cancellation, create: { facilityId: id, ...input.cancellation } }),
  ]);
  await audit({ action: "facility.policies", actorId: actor.id, actorRole: actor.role, entityType: "ParkingFacility", entityId: id });
  return { reservation, cancellation };
}

/** Everything the facility must have configured before it can be listed to drivers. */
export async function approvalBlockers(facilityId: string): Promise<string[]> {
  const f = await db.parkingFacility.findUniqueOrThrow({
    where: { id: facilityId },
    select: { totalCapacity: true, is24Hours: true, _count: { select: { hours: true, pricingRules: { where: { active: true } } } } },
  });
  const out: string[] = [];
  if (f.totalCapacity < 1) out.push("No parking capacity configured");
  if (!f.is24Hours && f._count.hours === 0) out.push("Operating hours not set");
  if (f._count.pricingRules === 0) out.push("No active pricing rule");
  return out;
}

/** Super-admin review. Approval is refused while the facility is incomplete. */
export async function reviewFacility(
  actor: Actor,
  id: string,
  action: Exclude<FacilityAction, "resubmit">,
  reason?: string,
  ip?: string | null,
) {
  if (actor.role !== "SUPER_ADMIN") throw forbidden();
  const f = await db.parkingFacility.findUnique({ where: { id }, select: { status: true } });
  if (!f) throw new AppError("NOT_FOUND", "Facility not found.");
  const to = nextFacilityStatus(f.status, action);
  if (action === "approve") {
    const blockers = await approvalBlockers(id);
    if (blockers.length) throw new AppError("CONFLICT", "Facility is not ready for approval.", { blockers });
  }
  const updated = await db.parkingFacility.update({
    where: { id },
    data: { status: to, rejectionReason: action === "reject" || action === "suspend" ? (reason ?? null) : null },
  });
  await audit({ action: `facility.${action}`, actorId: actor.id, actorRole: actor.role, entityType: "ParkingFacility", entityId: id, metadata: { from: f.status, to, reason }, ip });
  return updated;
}
