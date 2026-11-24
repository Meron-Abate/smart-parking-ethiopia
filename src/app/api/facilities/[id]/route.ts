import { route, ok } from "@/platform/http";
import { facilityUpdateSchema } from "@/modules/facilities/schemas";
import { getFacility, updateFacility } from "@/modules/facilities/service";

const roles = ["FACILITY_ADMIN", "SUPER_ADMIN"] as const;

export const GET = route({ roles: [...roles] }, async ({ user, params }) => ok(await getFacility(user, params.id!)));

export const PATCH = route({ roles: [...roles], body: facilityUpdateSchema }, async ({ user, params, body, ip }) =>
  ok(await updateFacility(user, params.id!, body, ip)),
);
