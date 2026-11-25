import { NextResponse } from "next/server";
import { route, ok } from "@/platform/http";
import { AppError } from "@/platform/errors";
import { db } from "@/platform/db";
import { confirmExtension, confirmReservation, getMyReservation } from "@/modules/reservations/service";

/**
 * DEVELOPMENT ONLY. Stands in for the payment provider until Phase 5: it marks the deposit as paid by moving the
 * reservation (or its pending extension) to CONFIRMED. It does not move money and does not exist in production.
 */
export const POST = route({ roles: ["DRIVER"] }, async ({ user, params }): Promise<NextResponse> => {
  if (process.env.NODE_ENV === "production") throw new AppError("NOT_FOUND", "Not found.");
  const id = params.id!;
  const r = await getMyReservation(user, id);
  if (r.status === "PENDING_PAYMENT") await confirmReservation(id, new Date(), user);
  else {
    const ext = await db.reservationExtension.findFirst({ where: { reservationId: id, status: "PENDING_PAYMENT" } });
    if (!ext) throw new AppError("CONFLICT", "Nothing is waiting for payment.");
    await confirmExtension(user, ext.id);
  }
  return ok(await getMyReservation(user, id));
});
