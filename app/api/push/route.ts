import type { NextRequest } from "next/server";
import { ensureSession, getSession } from "@/lib/auth/session";
import { formatDuration } from "@/lib/format";
import { isSameOrigin, jsonResponse, readJsonBody } from "@/lib/platform/http";
import { MAX_SUBSCRIPTION_BYTES, pushSubscriptionSchema, pushUnsubscribeSchema } from "@/lib/platform/push-schema";
import { pruneSessionSubscriptions, removeSessionSubscription } from "@/lib/platform/push-subscriptions";
import { getVapidPublicKey, saveSubscription } from "@/lib/push";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/*
 * Web push subscriptions for this device (components/pwa/push-toggle.tsx).
 *   GET     { publicKey }              the VAPID key for pushManager.subscribe()
 *   POST    PushSubscription JSON      store it for this device's session
 *   DELETE  { endpoint }               remove it, only if it's this device's
 */

export async function GET() {
  return jsonResponse({ publicKey: await getVapidPublicKey() });
}

const WINDOW_MS = 10 * 60_000;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonResponse({ ok: false, error: "Requests from other sites aren't allowed." }, 403);
  // Players at a venue often share one address (its Wi-Fi, or their carrier's NAT), so the tight
  // limit is per device; the per-address one only stops one machine from flooding the table.
  const ip = await clientIp();
  const current = await getSession();
  const byAddress = rateLimit(`push:ip:${ip}`, 600, WINDOW_MS);
  const byDevice = rateLimit(current ? `push:session:${current.session.id}` : `push:new:${ip}`, 20, WINDOW_MS);
  if (!byAddress.ok || !byDevice.ok) {
    const wait = Math.max(byAddress.retryAfterSec, byDevice.retryAfterSec, 60);
    return jsonResponse(
      { ok: false, error: `Too many attempts from this device. Try again in ${formatDuration(wait * 1000)}.` },
      429,
    );
  }

  const body = await readJsonBody(req, MAX_SUBSCRIPTION_BYTES);
  if (!body.ok) return jsonResponse({ ok: false, error: body.error }, body.status);
  const parsed = pushSubscriptionSchema.safeParse(body.value);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? "That doesn't look like a push subscription.";
    return jsonResponse({ ok: false, error }, 400);
  }

  const session = await ensureSession();
  await saveSubscription(session.id, { endpoint: parsed.data.endpoint, keys: parsed.data.keys });
  await pruneSessionSubscriptions(session.id);
  return jsonResponse({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonResponse({ ok: false, error: "Requests from other sites aren't allowed." }, 403);
  const body = await readJsonBody(req, MAX_SUBSCRIPTION_BYTES);
  if (!body.ok) return jsonResponse({ ok: false, error: body.error }, body.status);
  const parsed = pushUnsubscribeSchema.safeParse(body.value);
  if (!parsed.success) return jsonResponse({ ok: false, error: "Say which subscription to remove." }, 400);

  const current = await getSession();
  if (!current) return jsonResponse({ ok: true, removed: 0 });
  const removed = await removeSessionSubscription(current.session.id, parsed.data.endpoint);
  return jsonResponse({ ok: true, removed });
}
