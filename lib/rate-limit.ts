import "server-only";
import { headers } from "next/headers";

/*
 * Fixed-window rate limiter kept in memory. Good enough for a single server;
 * protects logins, join codes and answer guessing from brute force.
 *
 *   const limit = rateLimit(`login:${await clientIp()}`, 10, 15 * 60_000);
 *   if (!limit.ok) return fail(`Too many attempts. Try again in ${limit.retryAfterSec}s.`);
 */

type Bucket = { count: number; resetAt: number };
type RLGlobal = { __shpRate?: Map<string, Bucket> };
const g = globalThis as RLGlobal;
const buckets = g.__shpRate ?? new Map<string, Bucket>();
g.__shpRate = buckets;

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > 50_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP (first X-Forwarded-For hop when behind a proxy). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
