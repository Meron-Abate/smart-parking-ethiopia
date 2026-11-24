import type { PrismaClient, UserRole } from "@prisma/client";
import { forbidden, AppError } from "@/platform/errors";

export interface Actor {
  id: string;
  role: UserRole;
}

type Reader = Pick<PrismaClient, "parkingFacility" | "organizationMember" | "facilityStaff">;

/**
 * Resource-level isolation. Throws NOT_FOUND for missing facilities and FORBIDDEN when the
 * actor has no relationship to it. Every facility-scoped handler must call this.
 *  - SUPER_ADMIN: any facility
 *  - FACILITY_ADMIN: facilities of organizations they are a member of
 *  - ATTENDANT: facilities where they are active staff
 *  - DRIVER: never
 */
export async function assertFacilityAccess(db: Reader, actor: Actor, facilityId: string): Promise<void> {
  const facility = await db.parkingFacility.findUnique({
    where: { id: facilityId },
    select: { id: true, organizationId: true },
  });
  if (!facility) throw new AppError("NOT_FOUND", "Facility not found.");

  switch (actor.role) {
    case "SUPER_ADMIN":
      return;
    case "FACILITY_ADMIN": {
      const m = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: facility.organizationId, userId: actor.id } },
        select: { id: true },
      });
      if (m) return;
      break;
    }
    case "ATTENDANT": {
      const s = await db.facilityStaff.findUnique({
        where: { facilityId_userId: { facilityId, userId: actor.id } },
        select: { active: true },
      });
      if (s?.active) return;
      break;
    }
  }
  throw forbidden();
}

export async function assertOrganizationAccess(db: Reader, actor: Actor, organizationId: string): Promise<void> {
  if (actor.role === "SUPER_ADMIN") return;
  if (actor.role === "FACILITY_ADMIN") {
    const m = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: actor.id } },
      select: { id: true },
    });
    if (m) return;
  }
  throw forbidden();
}
