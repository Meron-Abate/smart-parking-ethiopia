import { Prisma, type User } from "@prisma/client";
import { db } from "@/platform/db";
import { AppError } from "@/platform/errors";
import { audit } from "@/modules/audit/service";
import { hashPassword, verifyPassword } from "./password";
import { normalizePhone, type LoginInput, type RegisterInput } from "./schemas";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type PublicUser = Pick<User, "id" | "email" | "phone" | "role" | "status"> & { fullName: string | null };

const toPublic = (u: User & { profile?: { fullName: string } | null }): PublicUser => ({
  id: u.id,
  email: u.email,
  phone: u.phone,
  role: u.role,
  status: u.status,
  fullName: u.profile?.fullName ?? null,
});

/** Public registration ALWAYS creates a DRIVER. Elevated roles are granted only by admin flows. */
export async function register(input: RegisterInput, ip?: string | null): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: {
        email: input.email ?? null,
        phone: input.phone ?? null,
        passwordHash,
        role: "DRIVER",
        profile: { create: { fullName: input.fullName } },
      },
      include: { profile: true },
    });
    await audit({ action: "auth.register", actorId: user.id, actorRole: "DRIVER", entityType: "User", entityId: user.id, ip });
    return toPublic(user);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Deliberately generic enough to be acceptable; a stricter anti-enumeration flow needs email verification (Phase 8).
      throw new AppError("CONFLICT", "An account with these details already exists.");
    }
    throw e;
  }
}

export async function login(input: LoginInput, ip?: string | null): Promise<PublicUser> {
  const id = input.identifier.trim();
  const phone = normalizePhone(id);
  const user = await db.user.findFirst({
    where: phone ? { phone } : { email: id.toLowerCase() },
    include: { profile: true },
  });

  const now = new Date();
  if (user?.lockedUntil && user.lockedUntil > now) {
    throw new AppError("ACCOUNT_LOCKED", "Too many failed attempts. Try again later.");
  }

  // Always run a bcrypt compare (dummy hash if no user) to equalise timing.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? null);

  if (!user || !ok) {
    if (user) {
      const failed = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await audit({ action: "auth.login_failed", actorId: user.id, entityType: "User", entityId: user.id, ip });
    }
    throw new AppError("INVALID_CREDENTIALS", "Incorrect email/phone or password.");
  }

  if (user.status !== "ACTIVE") throw new AppError("FORBIDDEN", "This account is suspended.");

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
  });
  await audit({ action: "auth.login", actorId: user.id, actorRole: user.role, entityType: "User", entityId: user.id, ip });
  return toPublic(user);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const u = await db.user.findUnique({ where: { id }, include: { profile: true } });
  return u && u.status === "ACTIVE" ? toPublic(u) : null;
}
