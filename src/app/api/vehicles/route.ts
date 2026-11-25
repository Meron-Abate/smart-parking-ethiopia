import { route, ok } from "@/platform/http";
import { vehicleSchema } from "@/modules/vehicles/schemas";
import { addVehicle, listVehicles } from "@/modules/vehicles/service";

export const GET = route({ roles: ["DRIVER"] }, async ({ user }) => ok(await listVehicles(user.id)));
export const POST = route({ roles: ["DRIVER"], body: vehicleSchema, rateLimit: { name: "vehicle-add", limit: 20, windowMs: 60_000 } }, async ({ user, body }) =>
  ok(await addVehicle(user.id, body), { status: 201 }),
);
