import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Read APP_NAME when the manifest is requested, not when the app was built,
// so one Docker image can serve differently named installs.
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: env.appName,
    short_name: env.appName,
    description:
      "Scavenger hunts on your phone: join your team with a code, send photo proof for each task, and follow the live scoreboard.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "en",
    dir: "ltr",
    categories: ["games", "social", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Shown in the install dialog (Chrome's richer install sheet needs them). Taken from the demo data with
    // scripts/shot.ts (--mobile at 390×844 @2x; 1440×900 for the big screen) and saved as WebP.
    screenshots: [
      {
        src: "/icons/screenshot-narrow.webp",
        sizes: "780x1688",
        type: "image/webp",
        form_factor: "narrow",
        label: "A team's hunt on a phone: rank, points and the tasks to find",
      },
      {
        src: "/icons/screenshot-wide.webp",
        sizes: "1440x900",
        type: "image/webp",
        form_factor: "wide",
        label: "Final results on the big screen, with the latest photos",
      },
    ],
    // Most installs are players', so no organizer shortcut: organizers reach their hunts from the home page.
    shortcuts: [
      {
        name: "Enter a hunt code",
        short_name: "Hunt code",
        description: "Join a hunt with its six-digit code",
        url: "/",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
