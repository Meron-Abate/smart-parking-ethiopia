import { route, ok } from "@/platform/http";
import { registerSchema } from "@/modules/auth/schemas";
import { register } from "@/modules/auth/service";
import { attachSession } from "@/modules/auth/cookie";

export const POST = route(
  { body: registerSchema, rateLimit: { name: "register", limit: 10, windowMs: 60 * 60_000 } },
  async ({ body, ip }) => {
    const user = await register(body, ip);
    return attachSession(ok(user, { status: 201 }), user.id);
  },
);
