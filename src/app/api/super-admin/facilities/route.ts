import { route, ok } from "@/platform/http";
import { facilityListQuery } from "@/modules/facilities/schemas";
import { listFacilities } from "@/modules/facilities/service";

export const GET = route({ roles: ["SUPER_ADMIN"], query: facilityListQuery }, async ({ user, query }) => {
  const { rows, meta } = await listFacilities(user, query);
  return ok(rows, { meta });
});
