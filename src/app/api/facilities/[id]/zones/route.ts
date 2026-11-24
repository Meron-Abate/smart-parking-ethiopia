import { route, ok } from "@/platform/http";
import { zoneSchema } from "@/modules/facilities/schemas";
import { addZone } from "@/modules/inventory/service";

export const POST = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], body: zoneSchema }, async ({ user, params, body }) =>
  ok(await addZone(user, params.id!, body), { status: 201 }),
);
