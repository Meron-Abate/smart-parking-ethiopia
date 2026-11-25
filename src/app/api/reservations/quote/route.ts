import { route, ok } from "@/platform/http";
import { quoteQuery } from "@/modules/reservations/schemas";
import { quoteReservation } from "@/modules/reservations/service";

export const GET = route({ roles: ["DRIVER"], query: quoteQuery, rateLimit: { name: "quote", limit: 60, windowMs: 60_000 } }, async ({ query }) =>
  ok(await quoteReservation(query.facilityId, new Date(query.startAt), query.durationMinutes, query.vehicleType)),
);
