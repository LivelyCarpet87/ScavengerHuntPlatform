import "server-only";
import { env } from "@/lib/env";

/*
 * Helpers for route handlers that accept JSON from the app's own pages.
 * (Server Actions get Next's built-in origin check; route handlers don't.)
 */

/**
 * True when a state-changing request comes from this site's pages or its
 * service worker: Sec-Fetch-Site says same-origin, and the Origin header (when
 * present) names this host or the configured APP_URL.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (host === forwarded || host === req.headers.get("host")) return true;
  if (env.appUrl) {
    try {
      return new URL(env.appUrl).host === host;
    } catch {
      return false;
    }
  }
  return false;
}

export type JsonBody = { ok: true; value: unknown } | { ok: false; status: number; error: string };

/** Reads a JSON body, refusing anything over `maxBytes` without buffering it all. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<JsonBody> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return { ok: false, status: 413, error: "That request is too large." };
  if (!req.body) return { ok: false, status: 400, error: "The request was empty." };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413, error: "That request is too large." };
    }
    chunks.push(value);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, error: "Send the request body as JSON." };
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
