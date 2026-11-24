import { route, ok } from "@/platform/http";
import { organizationRegisterSchema } from "@/modules/facilities/schemas";
import { registerOrganization } from "@/modules/organizations/service";
import { attachSession } from "@/modules/auth/cookie";

/** Public sign-up for parking operators. Creates a FACILITY_ADMIN account + organization and signs them in. */
export const POST = route(
  { body: organizationRegisterSchema, rateLimit: { name: "org-register", limit: 5, windowMs: 60 * 60_000 } },
  async ({ body, ip }) => {
    const { user, organization } = await registerOrganization(body, ip);
    return attachSession(ok({ user, organization }, { status: 201 }), user.id);
  },
);
