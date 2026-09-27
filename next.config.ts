import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self), screen-wake-lock=(self)",
  },
];

const nextConfig: NextConfig = {
  // Produces a self-contained server in .next/standalone for Docker/self-hosting.
  output: "standalone",
  poweredByHeader: false,
  // Build/runtime errors still show as an overlay; the corner badge just gets in the way of screenshots.
  devIndicators: false,
  experimental: {
    // Uploads go through route handlers; actions only carry small forms and cover images.
    serverActions: { bodySizeLimit: "12mb" },
    // Navigations and Server Actions wait for connectivity instead of failing —
    // hunts happen outdoors on patchy mobile data.
    useOffline: true,
    // Low-memory dev machines (e.g. running several tools at once): evict
    // Turbopack's cache from memory after every snapshot to disk.
    turbopackMemoryEviction: process.env.NEXT_LOW_MEMORY ? "full" : "auto",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
