import { route, ok } from "@/platform/http";
import { clearSession } from "@/modules/auth/cookie";

export const POST = route({}, async () => clearSession(ok({ loggedOut: true })));
