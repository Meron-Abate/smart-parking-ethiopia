import { route, ok } from "@/platform/http";
import { spaceUpdateSchema } from "@/modules/facilities/schemas";
import { updateSpace } from "@/modules/inventory/service";

export const PATCH = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], body: spaceUpdateSchema }, async ({ user, params, body, ip }) =>
  ok(await updateSpace(user, params.id!, body, ip)),
);
