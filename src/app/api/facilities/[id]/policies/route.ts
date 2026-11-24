import { route, ok } from "@/platform/http";
import { policiesSchema } from "@/modules/facilities/schemas";
import { setPolicies } from "@/modules/facilities/service";

export const PUT = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], body: policiesSchema }, async ({ user, params, body }) =>
  ok(await setPolicies(user, params.id!, body)),
);
