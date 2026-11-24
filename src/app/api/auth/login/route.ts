import { route, ok } from "@/platform/http";
import { loginSchema } from "@/modules/auth/schemas";
import { login } from "@/modules/auth/service";
import { attachSession } from "@/modules/auth/cookie";

export const POST = route(
  { body: loginSchema, rateLimit: { name: "login", limit: 20, windowMs: 15 * 60_000 } },
  async ({ body, ip }) => {
    const user = await login(body, ip);
    return attachSession(ok(user), user.id);
  },
);
