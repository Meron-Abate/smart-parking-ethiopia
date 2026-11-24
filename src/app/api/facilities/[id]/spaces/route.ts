import { route, ok } from "@/platform/http";
import { spacesCreateSchema } from "@/modules/facilities/schemas";
import { addSpaces } from "@/modules/inventory/service";

export const POST = route({ roles: ["FACILITY_ADMIN", "SUPER_ADMIN"], body: spacesCreateSchema }, async ({ user, params, body, ip }) =>
  ok(await addSpaces(user, params.id!, body, ip), { status: 201 }),
);
