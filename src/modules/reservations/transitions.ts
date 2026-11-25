import type { ReservationStatus } from "@prisma/client";
import { AppError } from "@/platform/errors";

export type ReservationAction = "confirm" | "expire" | "cancel" | "noShow";

/**
 * The only legal reservation status changes made so far (check-in, completion and refunds arrive in later phases).
 * `blocksInventory` is the value of Reservation.blocksInventory after the change.
 * Callers pass an action, never a target status.
 */
const TABLE: Record<ReservationAction, { from: ReservationStatus[]; to: ReservationStatus; blocks: boolean; verb: string }> = {
  confirm: { from: ["PENDING_PAYMENT"], to: "CONFIRMED", blocks: true, verb: "confirmed" },
  expire: { from: ["PENDING_PAYMENT"], to: "EXPIRED", blocks: false, verb: "expired" },
  cancel: { from: ["PENDING_PAYMENT", "CONFIRMED"], to: "CANCELLED", blocks: false, verb: "cancelled" },
  noShow: { from: ["CONFIRMED"], to: "NO_SHOW", blocks: false, verb: "marked as no-show" },
};

export function applyReservationAction(current: ReservationStatus, action: ReservationAction): { status: ReservationStatus; blocksInventory: boolean } {
  const rule = TABLE[action];
  if (current === rule.to) throw new AppError("CONFLICT", `This reservation is already ${rule.verb}.`);
  if (!rule.from.includes(current)) {
    throw new AppError("CONFLICT", `A reservation that is ${current.replace(/_/g, " ").toLowerCase()} cannot be ${rule.verb}.`);
  }
  return { status: rule.to, blocksInventory: rule.blocks };
}
