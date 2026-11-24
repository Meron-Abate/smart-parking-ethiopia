import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sp_session";

export interface SessionClaims {
  /** user id. Role is deliberately NOT in the token: it is re-read from the DB on every request. */
  sub: string;
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(userId: string, secret: string, ttlHours: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(key(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    return payload.sub ? { sub: payload.sub } : null;
  } catch {
    return null;
  }
}

export const cookieOptions = (ttlHours: number, secure: boolean) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure,
  path: "/",
  maxAge: ttlHours * 3600,
});
