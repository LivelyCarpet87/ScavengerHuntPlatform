"use client";

import { Bell, BellOff, BellRing, Smartphone } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClaimIosSteps } from "./install-state";
import { IosInstallSteps } from "./ios-install-steps";
import { isIOS, isStandalone, pushSupported } from "./platform";

/*
 * Push notifications for this device: results of your team's submissions,
 * announcements and new tasks (and new submissions for judges). Subscribes
 * with the server's VAPID key from GET /api/push and stores the subscription
 * against this device's session (POST /api/push); turning off unsubscribes and
 * DELETEs it.
 */

type Status = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

class PushError extends Error {}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return true; // browsers that don't expose it: assume it matches
  const a = new Uint8Array(current);
  const b = base64UrlToBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function fetchPublicKey(): Promise<string> {
  const res = await fetch("/api/push", { cache: "no-store" });
  if (!res.ok) throw new PushError("Couldn't reach the server. Check your connection and try again.");
  const { publicKey } = (await res.json()) as { publicKey?: string };
  if (!publicKey) throw new PushError("Notifications aren't set up on this server yet.");
  return publicKey;
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new PushError(body?.error ?? "The server didn't accept this device. Try again in a moment.");
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new PushError(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** The active service worker registration, registering /sw.js if this page hasn't yet. */
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  if (!(await navigator.serviceWorker.getRegistration("/"))) {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }
  return withTimeout(
    navigator.serviceWorker.ready,
    20_000,
    "The app is still getting ready on this device. Wait a few seconds and try again.",
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function errorMessage(err: unknown): string {
  if (err instanceof PushError) return err.message;
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError") return "Notifications are blocked for this site in your browser settings.";
  if (name === "AbortError" || name === "NotSupportedError") {
    return "Your browser couldn't reach its notification service. Try again later, or in another browser.";
  }
  return "Something went wrong turning on notifications. Try again.";
}

export function PushToggle({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The card changes in place, which is confirmation enough to see; this tells screen readers.
  const [announcement, setAnnouncement] = useState("");
  const keyRef = useRef<string | null>(null);
  const titleId = useId();
  useClaimIosSteps(status === "ios-install");

  const detect = useCallback(async (): Promise<Status> => {
    if (!pushSupported()) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
    if (Notification.permission === "denied") return "denied";
    const sub = await currentSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const next = await detect().catch((): Status => "unsupported");
      if (cancelled) return;
      setStatus(next);
      if (next !== "on" && next !== "off") return;
      // Warm the key so the click handler doesn't wait on the network.
      const key = await fetchPublicKey().catch(() => null);
      if (cancelled || !key) return;
      keyRef.current = key;
      if (next !== "on") return;
      // Keep the server in step with this device: re-link the subscription to this session,
      // and quietly replace it if the server's keys changed.
      try {
        let sub = await currentSubscription();
        if (sub && !sameKey(sub, key)) {
          await sub.unsubscribe();
          const reg = await readyRegistration();
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
        }
        if (sub) await saveSubscription(sub);
      } catch {
        // Not fatal: the toggle still reflects this device; the next visit retries.
      }
    };
    void check();

    // Reflect changes made in the browser's site settings while the page is open.
    let permissions: PermissionStatus | null = null;
    const onChange = () => void check();
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((p) => {
        if (cancelled) return;
        permissions = p;
        p.addEventListener("change", onChange);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      permissions?.removeEventListener("change", onChange);
    };
  }, [detect]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      // Ask first, straight from the tap: Safari only shows the prompt during a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        if (permission === "default") setError("Notifications are still off. Tap the button again and choose Allow.");
        return;
      }
      const reg = await readyRegistration();
      const key = keyRef.current ?? (await fetchPublicKey());
      keyRef.current = key;
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
      try {
        await saveSubscription(sub);
      } catch (err) {
        // The server doesn't know this device, so don't leave the browser subscribed either.
        await sub.unsubscribe().catch(() => undefined);
        throw err;
      }
      setStatus("on");
      setAnnouncement("Notifications are on for this device.");
    } catch (err) {
      setError(errorMessage(err));
      setStatus(await detect().catch((): Status => "off"));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setStatus("off");
      setAnnouncement("Notifications are off for this device.");
    } catch {
      setError("Couldn't turn notifications off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const what = "Results of your submissions, announcements and new tasks, even when the app is closed.";
  let icon = <Bell aria-hidden className="size-5" />;
  let title = "Notifications";
  let body: React.ReactNode = what;
  let action: React.ReactNode = null;

  switch (status) {
    case "checking":
      break;
    case "off":
      title = "Get notified";
      action = (
        <Button variant="secondary" pending={busy} onClick={turnOn}>
          Turn on notifications
        </Button>
      );
      break;
    case "on":
      icon = <BellRing aria-hidden className="size-5 text-forest" />;
      title = "Notifications are on";
      body = "You'll get results of your submissions, announcements and new tasks on this device.";
      action = (
        <Button variant="quiet" pending={busy} onClick={turnOff}>
          Turn off
        </Button>
      );
      break;
    case "denied":
      icon = <BellOff aria-hidden className="size-5 text-danger" />;
      title = "Notifications are blocked";
      body = (
        <>
          Notifications are blocked for this site in your browser settings. Allow them in the site settings (usually
          behind the icon next to the address), then come back here.
        </>
      );
      break;
    case "ios-install":
      icon = <Smartphone aria-hidden className="size-5" />;
      title = "Notifications need the app";
      body = (
        <>
          <p>Install the app to your Home Screen first, then turn on notifications here.</p>
          <IosInstallSteps className="mt-3" finalStep="Open the app from your Home Screen and turn on notifications." />
        </>
      );
      break;
    case "unsupported":
      icon = <BellOff aria-hidden className="size-5" />;
      title = "Notifications aren't available here";
      body = "This browser can't show notifications from websites. Keep this page open to see results as they come in.";
      break;
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "checking" || busy}
      className={cn("flex items-start gap-4 rounded-lg border border-line bg-paper p-4", className)}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mist text-ink-2">{icon}</span>
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="font-semibold">
          {title}
        </h3>
        <div className="mt-0.5 text-sm text-ink-2">{body}</div>
        {action ? <div className="mt-3">{action}</div> : null}
        {status === "checking" ? <div aria-hidden className="mt-3 h-11" /> : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </section>
  );
}
