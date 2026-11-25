import { route, ok } from "@/platform/http";
import { removeVehicle } from "@/modules/vehicles/service";

export const DELETE = route({ roles: ["DRIVER"] }, async ({ user, params }) => {
  await removeVehicle(user.id, params.id!);
  return ok({ removed: true });
});
