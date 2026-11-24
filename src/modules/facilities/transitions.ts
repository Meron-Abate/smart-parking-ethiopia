import type { FacilityStatus } from "@prisma/client";
import { AppError } from "@/platform/errors";

export type FacilityAction = "approve" | "reject" | "suspend" | "resubmit";

/** The only legal facility status changes. Callers pass an action, never a target status. */
const TABLE: Record<FacilityAction, { from: FacilityStatus[]; to: FacilityStatus }> = {
  approve: { from: ["PENDING_APPROVAL", "SUSPENDED"], to: "APPROVED" }, // SUSPENDED -> APPROVED = reinstate
  reject: { from: ["PENDING_APPROVAL"], to: "REJECTED" },
  suspend: { from: ["APPROVED"], to: "SUSPENDED" },
  resubmit: { from: ["REJECTED"], to: "PENDING_APPROVAL" },
};

export function nextFacilityStatus(current: FacilityStatus, action: FacilityAction): FacilityStatus {
  const rule = TABLE[action];
  if (!rule.from.includes(current)) {
    throw new AppError("CONFLICT", `Cannot ${action} a facility that is ${current}.`);
  }
  return rule.to;
}
