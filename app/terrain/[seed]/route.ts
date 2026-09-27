import { gzipSync } from "node:zlib";
import { contourSvg, isTerrainCached } from "@/lib/contours";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const SEED = /^[A-Za-z0-9:_-]{1,64}$/;

type GzipGlobal = { __shpTerrainGz?: Map<string, Uint8Array<ArrayBuffer>> };
const g = globalThis as GzipGlobal;
const gzipped = g.__shpTerrainGz ?? new Map<string, Uint8Array<ArrayBuffer>>();
g.__shpTerrainGz = gzipped;

/**
 * A hunt's generated terrain as an SVG, cached forever (the art is fully
 * determined by the seed). <ContourArt> uses it as a CSS mask. Compressed here
 * because route handler responses aren't compressed by Next (~250 KB → ~70 KB).
 */
export async function GET(req: Request, ctx: { params: Promise<{ seed: string }> }) {
  const { seed } = await ctx.params;
  if (!SEED.test(seed)) return new Response("Not found", { status: 404 });
  // Generating new terrain costs a little CPU; don't let one client ask for endless seeds.
  if (!isTerrainCached(seed)) {
    const limit = rateLimit(`terrain:${await clientIp()}`, 120, 60_000);
    if (!limit.ok) {
      return new Response("Too many requests", {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      });
    }
  }
  const svg = contourSvg(seed);
  const headers = new Headers({
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
  });
  if (!/\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) return new Response(svg, { headers });

  let body = gzipped.get(seed);
  if (!body) {
    const buf = gzipSync(svg, { level: 9 });
    body = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) as Uint8Array<ArrayBuffer>;
    if (gzipped.size > 500) gzipped.clear();
    gzipped.set(seed, body);
  }
  headers.set("Content-Encoding", "gzip");
  return new Response(body, { headers });
}
