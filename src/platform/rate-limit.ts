import { AppError } from "./errors";

/**
 * In-memory fixed-window limiter. Phase 1 only: it is per-process, so it is NOT
 * sufficient behind multiple instances. Replaced by a Redis implementation in Phase 4
 * (same function signature).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please try again shortly.", {
      retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000),
    });
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
