import { route, ok } from "@/platform/http";
import { pricingRulesSchema } from "@/modules/facilities/schemas";
import { setPricingRules } from "@/modules/facilities/service";

export const PUT = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], body: pricingRulesSchema }, async ({ user, params, body }) =>
  ok(await setPricingRules(user, params.id!, body)),
);
