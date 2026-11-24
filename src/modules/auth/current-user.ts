import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { env } from "@/platform/env";
import { HOME_BY_ROLE } from "@/modules/rbac/policy";
import { SESSION_COOKIE, verifySession } from "./session";
import { getUserById, type PublicUser } from "./service";

/** The user is ALWAYS re-read from the database: role changes and suspensions apply immediately. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token, env().AUTH_SECRET);
  return claims ? getUserById(claims.sub) : null;
}

/** Server-component guard for page layouts. */
export async function requirePageRole(...roles: UserRole[]): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(HOME_BY_ROLE[user.role]);
  return user;
}
