import type { NextResponse } from "next/server";
import { env } from "@/platform/env";
import { SESSION_COOKIE, cookieOptions, signSession } from "./session";

export async function attachSession(res: NextResponse, userId: string): Promise<NextResponse> {
  const e = env();
  const token = await signSession(userId, e.AUTH_SECRET, e.SESSION_TTL_HOURS);
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(e.SESSION_TTL_HOURS, e.NODE_ENV === "production"));
  return res;
}

export function clearSession(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(0, env().NODE_ENV === "production"), maxAge: 0 });
  return res;
}
