import { route, ok } from "@/platform/http";
import { hoursSchema } from "@/modules/facilities/schemas";
import { setOperatingHours } from "@/modules/facilities/service";

export const PUT = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], body: hoursSchema }, async ({ user, params, body }) =>
  ok(await setOperatingHours(user, params.id!, body)),
);
