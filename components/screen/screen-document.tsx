"use client";

import { useEffect, useSyncExternalStore } from "react";
import { SCREEN_BOOT_SCRIPT, SCREEN_FONT_SIZE, SCREEN_WIDE_QUERY } from "./boot-script";

const subscribeNothing = () => () => {};

/**
 * Mounted by the big screen's layout, so it lives exactly as long as the
 * viewer stays on /h/[slug]/screen, whatever the page shows (the board, the
 * "who can see this" message, a 404). Switches <html> to Night-O (or
 * ?theme=light) and the projector type scale, and puts both back when the
 * viewer leaves, so the next page isn't left dark and scaled.
 *
 * On a full page load the inline script does the switching before the first
 * paint. It is only rendered on the server and kept through hydration:
 * React never runs a script it creates on the client, and warns about it.
 */
export function ScreenDocument() {
  // False on the server and while hydrating; true when mounted by a client-side navigation.
  const mountedOnClient = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  useEffect(() => {
    const root = document.documentElement;
    const data = root.dataset;
    // After a full page load the boot script has already switched things and left the originals behind.
    const booted = "bigScreen" in data;
    const prevTheme = booted ? data.screenPrevTheme || undefined : data.theme;
    const prevFont = booted ? (data.screenPrevFont ?? "") : root.style.fontSize;
    data.theme = new URLSearchParams(window.location.search).get("theme") === "light" ? "light" : "dark";
    data.bigScreen = "";
    const wide = window.matchMedia(SCREEN_WIDE_QUERY);
    const apply = () => {
      root.style.fontSize = wide.matches ? SCREEN_FONT_SIZE : prevFont;
    };
    apply();
    wide.addEventListener("change", apply);
    return () => {
      wide.removeEventListener("change", apply);
      if (prevTheme === undefined) delete data.theme;
      else data.theme = prevTheme;
      delete data.bigScreen;
      delete data.screenPrevTheme;
      delete data.screenPrevFont;
      root.style.fontSize = prevFont;
    };
  }, []);

  if (mountedOnClient) return null;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script, no user data
  return <script dangerouslySetInnerHTML={{ __html: SCREEN_BOOT_SCRIPT }} />;
}
