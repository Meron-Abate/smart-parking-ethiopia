import { route, ok } from "@/platform/http";
import { extendSchema } from "@/modules/reservations/schemas";
import { requestExtension } from "@/modules/reservations/service";

export const POST = route({ roles: ["DRIVER"], body: extendSchema, rateLimit: { name: "extend", limit: 10, windowMs: 60_000 } }, async ({ user, params, body, ip }) =>
  ok(await requestExtension(user, params.id!, body.extraMinutes, new Date(), ip), { status: 201 }),
);
