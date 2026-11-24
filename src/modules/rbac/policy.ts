import type { UserRole } from "@prisma/client";
import { forbidden } from "@/platform/errors";

/**
 * Capability matrix. Role-level only; resource scope (which org/facility) is in scope.ts.
 * Add a capability here first, then reference it from handlers — never test role strings inline.
 */
export const CAPABILITIES = {
  "booking.create": ["DRIVER"],
  "vehicle.manage": ["DRIVER"],
  "facility.register": ["FACILITY_ADMIN", "SUPER_ADMIN"],
  "facility.manage": ["FACILITY_ADMIN", "SUPER_ADMIN"],
  "facility.approve": ["SUPER_ADMIN"],
  "staff.manage": ["FACILITY_ADMIN", "SUPER_ADMIN"],
  "attendant.operate": ["ATTENDANT", "FACILITY_ADMIN", "SUPER_ADMIN"],
  "finance.view": ["FACILITY_ADMIN", "SUPER_ADMIN"],
  "platform.admin": ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export const can = (role: UserRole, capability: Capability): boolean =>
  (CAPABILITIES[capability] as readonly UserRole[]).includes(role);

export function assertCan(role: UserRole, capability: Capability): void {
  if (!can(role, capability)) throw forbidden();
}

/** Where each role lands after sign-in. */
export const HOME_BY_ROLE: Record<UserRole, string> = {
  DRIVER: "/dashboard",
  ATTENDANT: "/attendant",
  FACILITY_ADMIN: "/facility",
  SUPER_ADMIN: "/admin",
};
