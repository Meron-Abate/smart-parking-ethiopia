import { route, ok } from "@/platform/http";
import { getMyReservation } from "@/modules/reservations/service";

export const GET = route({ roles: ["DRIVER"] }, async ({ user, params }) => ok(await getMyReservation(user, params.id!)));
