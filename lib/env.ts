import path from "node:path";

/**
 * Server-side configuration. Every value has a working default so a fresh
 * checkout runs with `bun install && bun run dev`.
 */
// Runtime data lives outside the build: the turbopackIgnore hints keep Next from
// tracing (and bundling) the data directory into the standalone server.
const dataDir = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data");
const appUrl = process.env.APP_URL?.replace(/\/+$/, "") || null;

export const env = {
  appName: process.env.APP_NAME || "Scavenger",
  /** Public base URL, e.g. https://hunt.example.com (no trailing slash). */
  appUrl,
  dataDir,
  uploadsDir: path.join(/*turbopackIgnore: true*/ dataDir, "uploads"),
  databaseUrl: process.env.DATABASE_URL || `file:${path.join(/*turbopackIgnore: true*/ dataDir, "app.db")}`,
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024,
  cookieSecure:
    process.env.COOKIE_SECURE != null
      ? process.env.COOKIE_SECURE === "true"
      : (appUrl?.startsWith("https://") ?? false),
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    privateKey: process.env.VAPID_PRIVATE_KEY || null,
    subject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  },
  isDev: process.env.NODE_ENV !== "production",
} as const;
