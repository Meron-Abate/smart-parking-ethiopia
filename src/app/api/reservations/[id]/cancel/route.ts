import { route, ok } from "@/platform/http";
import { cancelReservation } from "@/modules/reservations/service";

export const POST = route({ roles: ["DRIVER"] }, async ({ user, params, ip }) => ok(await cancelReservation(user, params.id!, new Date(), ip)));
