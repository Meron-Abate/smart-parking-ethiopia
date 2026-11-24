import { route, ok } from "@/platform/http";

export const GET = route({ roles: [] }, async ({ user }) => ok(user));
