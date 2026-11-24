import { route, ok } from "@/platform/http";
import { floorSchema } from "@/modules/facilities/schemas";
import { addFloor } from "@/modules/inventory/service";

export const POST = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], body: floorSchema }, async ({ user, params, body }) =>
  ok(await addFloor(user, params.id!, body), { status: 201 }),
);
