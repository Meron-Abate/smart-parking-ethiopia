import { db } from "@/platform/db";
import { AppError } from "@/platform/errors";
import type { VehicleInput } from "./schemas";

const MAX_VEHICLES = 10;

export const listVehicles = (userId: string) =>
  db.vehicle.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });

export async function addVehicle(userId: string, input: VehicleInput) {
  const active = await db.vehicle.count({ where: { userId, deletedAt: null } });
  if (active >= MAX_VEHICLES) throw new AppError("CONFLICT", `You can save up to ${MAX_VEHICLES} vehicles.`);
  const existing = await db.vehicle.findUnique({ where: { userId_plateNumber: { userId, plateNumber: input.plateNumber } } });
  if (existing && !existing.deletedAt) throw new AppError("CONFLICT", "You already saved a vehicle with this plate number.");
  const data = { ...input, deletedAt: null, isDefault: active === 0 };
  // a previously removed plate is revived (reservations keep pointing at the same row)
  return existing ? db.vehicle.update({ where: { id: existing.id }, data }) : db.vehicle.create({ data: { ...data, userId } });
}

/** Soft delete: past reservations keep their vehicle. Vehicles with a live reservation cannot be removed. */
export async function removeVehicle(userId: string, id: string) {
  const v = await db.vehicle.findFirst({ where: { id, userId, deletedAt: null } });
  if (!v) throw new AppError("NOT_FOUND", "Vehicle not found.");
  const live = await db.reservation.count({ where: { vehicleId: id, blocksInventory: true } });
  if (live > 0) throw new AppError("CONFLICT", "This vehicle has an upcoming reservation. Cancel it first.");
  await db.vehicle.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
  if (v.isDefault) {
    const next = await db.vehicle.findFirst({ where: { userId, deletedAt: null }, orderBy: { createdAt: "asc" } });
    if (next) await db.vehicle.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}
