import { route, ok } from "@/platform/http";
import { AppError } from "@/platform/errors";
import { rejectSchema } from "@/modules/facilities/schemas";
import { reviewFacility } from "@/modules/facilities/service";
import { z } from "zod";

// POST /api/super-admin/facilities/:id/{approve|reject|suspend}
const body = rejectSchema.partial(); // reason required for reject/suspend, checked below

export const POST = route({ roles: ["SUPER_ADMIN"], body }, async ({ user, params, body, ip }) => {
  const action = z.enum(["approve", "reject", "suspend"]).safeParse(params.action);
  if (!action.success) throw new AppError("NOT_FOUND", "Unknown action.");
  if (action.data !== "approve" && !body.reason) {
    throw new AppError("VALIDATION_ERROR", "A reason (at least 5 characters) is required.");
  }
  return ok(await reviewFacility(user, params.id!, action.data, body.reason, ip));
});
