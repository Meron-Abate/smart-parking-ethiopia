import { route, ok } from "@/platform/http";
import { createReservationSchema, myReservationsQuery } from "@/modules/reservations/schemas";
import { createReservation, listMyReservations } from "@/modules/reservations/service";

export const GET = route({ roles: ["DRIVER"], query: myReservationsQuery }, async ({ user, query }) => ok(await listMyReservations(user, query.scope)));
export const POST = route({ roles: ["DRIVER"], body: createReservationSchema, rateLimit: { name: "reserve", limit: 10, windowMs: 60_000 } }, async ({ user, body, ip }) =>
  ok(await createReservation(user, body, new Date(), ip), { status: 201 }),
);
