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
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Enter a hunt code",
        short_name: "Hunt code",
        description: "Join a hunt with its six-digit code",
        url: "/",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Organizer dashboard",
        short_name: "Dashboard",
        description: "The hunts you run or judge",
        url: "/dashboard",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
