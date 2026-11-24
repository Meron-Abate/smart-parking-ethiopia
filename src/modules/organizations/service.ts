import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/platform/db";
import { AppError } from "@/platform/errors";
import { audit } from "@/modules/audit/service";
import { hashPassword } from "@/modules/auth/password";
import { organizationRegisterSchema } from "@/modules/facilities/schemas";
import type { PublicUser } from "@/modules/auth/service";

export type OrganizationRegistration = z.infer<typeof organizationRegisterSchema>;

/**
 * Public sign-up for parking operators: creates the FACILITY_ADMIN user, the organization and the
 * membership atomically. The organization is ACTIVE; each facility it registers still needs super-admin approval.
 */
export async function registerOrganization(input: OrganizationRegistration, ip?: string | null) {
  const passwordHash = await hashPassword(input.admin.password);
  try {
    const { user, org } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.admin.email ?? null,
          phone: input.admin.phone ?? null,
          passwordHash,
          role: "FACILITY_ADMIN",
          profile: { create: { fullName: input.admin.fullName } },
        },
        include: { profile: true },
      });
      const org = await tx.organization.create({
        data: { ...input.organization, status: "ACTIVE", members: { create: { userId: user.id, role: "FACILITY_ADMIN" } } },
      });
      return { user, org };
    });
    await audit({ action: "organization.register", actorId: user.id, actorRole: "FACILITY_ADMIN", entityType: "Organization", entityId: org.id, ip });
    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      fullName: user.profile?.fullName ?? null,
    };
    return { user: publicUser, organization: org };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "An account with these details already exists.");
    }
    throw e;
  }
}
