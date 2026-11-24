import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/platform/db";
import { AppError, forbidden } from "@/platform/errors";
import { audit } from "@/modules/audit/service";
import { assertFacilityAccess, type Actor } from "@/modules/rbac/scope";
import type { floorSchema, zoneSchema, spacesCreateSchema, spaceUpdateSchema } from "@/modules/facilities/schemas";

async function manageAccess(actor: Actor, facilityId: string) {
  if (actor.role !== "FACILITY_ADMIN" && actor.role !== "SUPER_ADMIN") throw forbidden();
  await assertFacilityAccess(db, actor, facilityId);
}

async function requireIndividual(facilityId: string) {
  const f = await db.parkingFacility.findUniqueOrThrow({ where: { id: facilityId }, select: { inventoryModel: true, status: true } });
  if (f.inventoryModel !== "INDIVIDUAL_SPACES") {
    throw new AppError("CONFLICT", "This facility uses capacity-based inventory; it has no individual spaces.");
  }
  if (f.status === "SUSPENDED") throw new AppError("CONFLICT", "A suspended facility cannot be edited.");
}

function conflictOnDuplicate(e: unknown, msg: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", msg);
  throw e;
}

/** Total capacity of an individual-space facility is always the number of its spaces. */
async function syncCapacity(tx: Prisma.TransactionClient, facilityId: string) {
  const n = await tx.parkingSpace.count({ where: { facilityId } });
  await tx.parkingFacility.update({ where: { id: facilityId }, data: { totalCapacity: n } });
}

export async function addFloor(actor: Actor, facilityId: string, input: z.infer<typeof floorSchema>) {
  await manageAccess(actor, facilityId);
  await requireIndividual(facilityId);
  try {
    return await db.parkingFloor.create({ data: { facilityId, ...input } });
  } catch (e) {
    return conflictOnDuplicate(e, "A floor with this name already exists.");
  }
}

export async function addZone(actor: Actor, facilityId: string, input: z.infer<typeof zoneSchema>) {
  await manageAccess(actor, facilityId);
  await requireIndividual(facilityId);
  // the floor must belong to THIS facility, otherwise a client could attach zones across tenants
  const floor = await db.parkingFloor.findFirst({ where: { id: input.floorId, facilityId } });
  if (!floor) throw new AppError("NOT_FOUND", "Floor not found in this facility.");
  try {
    return await db.parkingZone.create({ data: { facilityId, floorId: floor.id, name: input.name } });
  } catch (e) {
    return conflictOnDuplicate(e, "A zone with this name already exists on this floor.");
  }
}

export async function addSpaces(actor: Actor, facilityId: string, input: z.infer<typeof spacesCreateSchema>, ip?: string | null) {
  await manageAccess(actor, facilityId);
  await requireIndividual(facilityId);
  const zone = await db.parkingZone.findFirst({ where: { id: input.zoneId, facilityId } });
  if (!zone) throw new AppError("NOT_FOUND", "Zone not found in this facility.");

  const labels =
    "label" in input ? [input.label] : Array.from({ length: input.count }, (_, i) => `${input.prefix}${input.from + i}`);
  try {
    const created = await db.$transaction(async (tx) => {
      await tx.parkingSpace.createMany({
        data: labels.map((label) => ({ facilityId, zoneId: zone.id, label, vehicleTypes: input.vehicleTypes, isCovered: input.isCovered })),
      });
      await syncCapacity(tx, facilityId);
      return tx.parkingSpace.findMany({ where: { facilityId, label: { in: labels } }, orderBy: { label: "asc" } });
    });
    await audit({ action: "inventory.spaces_added", actorId: actor.id, actorRole: actor.role, entityType: "ParkingFacility", entityId: facilityId, metadata: { count: labels.length }, ip });
    return created;
  } catch (e) {
    return conflictOnDuplicate(e, "One or more space labels already exist in this facility. Nothing was created.");
  }
}

export async function updateSpace(actor: Actor, spaceId: string, patch: z.infer<typeof spaceUpdateSchema>, ip?: string | null) {
  const space = await db.parkingSpace.findUnique({ where: { id: spaceId }, select: { facilityId: true } });
  if (!space) throw new AppError("NOT_FOUND", "Space not found.");
  await manageAccess(actor, space.facilityId);
  try {
    const updated = await db.parkingSpace.update({ where: { id: spaceId }, data: patch });
    await audit({ action: "inventory.space_updated", actorId: actor.id, actorRole: actor.role, entityType: "ParkingSpace", entityId: spaceId, metadata: { fields: Object.keys(patch) }, ip });
    return updated;
  } catch (e) {
    return conflictOnDuplicate(e, "A space with this label already exists.");
  }
}
