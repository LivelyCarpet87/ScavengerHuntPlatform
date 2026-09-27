import type { MetadataRoute } from "next";

/**
 * Hunts are private events: keep every page out of search engines. Also the
 * tiny, always-there address the offline banner and the offline page ask
 * (HEAD /robots.txt, which the service worker never answers) to find out
 * whether the server can be reached again — see components/pwa.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
