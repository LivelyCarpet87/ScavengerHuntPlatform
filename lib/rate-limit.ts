import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

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

/**
 * Checks a limit without counting this call — for limits that should only
 * count failures (e.g. wrong codes): peek first, then call rateLimit() on a miss.
 */
export function peekRateLimit(key: string, limit: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now || bucket.count < limit) return { ok: true, retryAfterSec: 0 };
  return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
}

/**
 * The client address for rate limits, from X-Forwarded-For counted from the
 * right: the last `hops` entries were written by proxies we run (1 = the
 * reverse proxy in front of the app, set with TRUSTED_PROXY_HOPS), anything
 * further left is whatever the client sent and could be made up. Without a
 * proxy, Next.js fills the header with the socket's address.
 */
export async function clientIp(): Promise<string> {
  return pickClientIp((await headers()).get("x-forwarded-for"), env.trustedProxyHops);
}

export function pickClientIp(xff: string | null, hops = 1): string {
  const list = (xff ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const entry = list[Math.max(0, list.length - Math.max(1, hops))];
  return entry ? rateKey(entry) : "unknown";
}

/**
 * One bucket per IPv4 address, and per IPv6 /64 — the block a single phone
 * or household gets, so hopping between its addresses doesn't reset limits.
 */
function rateKey(entry: string): string {
  let ip = entry.toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^[\d.]+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":")); // IPv4 with a port
  ip = ip.replace(/%.*$/, ""); // IPv6 zone
  if (ip.startsWith("::ffff:") && ip.includes(".")) return ip.slice(7);
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
