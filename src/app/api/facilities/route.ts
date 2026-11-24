import { route, ok } from "@/platform/http";
import { facilityCreateSchema, facilityListQuery } from "@/modules/facilities/schemas";
import { createFacility, listFacilities } from "@/modules/facilities/service";

export const GET = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], query: facilityListQuery }, async ({ user, query }) => {
  const { rows, meta } = await listFacilities(user, query);
  return ok(rows, { meta });
});

export const POST = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], body: facilityCreateSchema }, async ({ user, body, ip }) =>
  ok(await createFacility(user, body, ip), { status: 201 }),
);
