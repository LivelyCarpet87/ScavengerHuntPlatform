import type { MetadataRoute } from "next";

/** Hunts are private events: keep every page out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
