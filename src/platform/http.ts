import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import type { UserRole } from "@prisma/client";
import { AppError, forbidden, unauthenticated } from "./errors";
import { env } from "./env";
import { rateLimit } from "./rate-limit";
import { getCurrentUser } from "@/modules/auth/current-user";
import type { PublicUser } from "@/modules/auth/service";

export const ok = <T>(data: T, init?: ResponseInit & { meta?: unknown }) =>
  NextResponse.json({ data, ...(init?.meta ? { meta: init.meta } : {}) }, init);

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json(
      { error: { code: e.code, message: e.message, details: e.details } },
      { status: e.status },
    );
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input.", details: e.flatten() } },
      { status: 422 },
    );
  }
  console.error("[api] unhandled", e); // TODO Phase 8: structured logger + error monitoring
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
}

export const clientIp = (req: NextRequest): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/** CSRF defence for cookie auth: state-changing requests must come from our own origin. */
export function assertSameOrigin(req: NextRequest): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(env().APP_ORIGIN).origin) {
    throw new AppError("CSRF_REJECTED", "Cross-origin request rejected.");
  }
}

interface Options<S extends z.ZodTypeAny | undefined, Q extends z.ZodTypeAny | undefined> {
  /** undefined = public. [] = any signed-in user. Otherwise one of the listed roles. */
  roles?: UserRole[];
  body?: S;
  /** Validated against the URL query string. */
  query?: Q;
  rateLimit?: { name: string; limit: number; windowMs: number };
}

interface Ctx<S extends z.ZodTypeAny | undefined, Q extends z.ZodTypeAny | undefined> {
  req: NextRequest;
  user: PublicUser;
  body: S extends z.ZodTypeAny ? z.infer<S> : undefined;
  query: Q extends z.ZodTypeAny ? z.infer<Q> : undefined;
  params: Record<string, string>;
  ip: string;
}

/**
 * The single entry point for route handlers:
 * origin check -> rate limit -> authenticate -> authorise -> validate -> run -> map errors.
 */
export function route<
  S extends z.ZodTypeAny | undefined = undefined,
  Q extends z.ZodTypeAny | undefined = undefined,
>(opts: Options<S, Q>, handler: (ctx: Ctx<S, Q>) => Promise<NextResponse>) {
  return async (
    req: NextRequest,
    routeCtx: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      assertSameOrigin(req);
      const ip = clientIp(req);
      if (opts.rateLimit) rateLimit(`${opts.rateLimit.name}:${ip}`, opts.rateLimit.limit, opts.rateLimit.windowMs);

      let user = null as PublicUser | null;
      if (opts.roles) {
        user = await getCurrentUser();
        if (!user) throw unauthenticated();
        if (opts.roles.length > 0 && !opts.roles.includes(user.role)) throw forbidden();
      }

      let query: unknown;
      if (opts.query) query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams));

      let body: unknown;
      if (opts.body) {
        const text = await req.text();
        let raw: unknown = {};
        if (text.trim()) {
          try {
            raw = JSON.parse(text);
          } catch {
            throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
          }
        }
        body = opts.body.parse(raw);
      }
      return await handler({
        req,
        user: user as PublicUser,
        body: body as Ctx<S, Q>["body"],
        query: query as Ctx<S, Q>["query"],
        params: (await routeCtx?.params) ?? {},
        ip,
      });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
