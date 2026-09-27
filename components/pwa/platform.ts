/*
 * Browser capability checks shared by the PWA components. Client-only: call
 * from effects or event handlers, never during render (they read navigator).
 */

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with touch). */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Running as an installed app (home screen / desktop app window). */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Whether this browser can receive web push at all (iOS only inside an installed app). */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** localStorage that never throws (private mode, blocked storage). */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  },
};
