/**
 * Shared setup for the end-to-end smoke tests (bun test + Playwright).
 *
 * They drive a running server with seeded demo data (files are named *.e2e.ts so a plain
 * `bun test` skips them):
 *   bun run db:seed --reset && bun run dev      # or: bun run build && bun run start
 *   E2E_BASE_URL=http://localhost:3000 bun run e2e
 *
 * Demo device sessions (scripts/seed.ts): dev-admin, dev-judge, dev-player-1 … dev-player-5.
 */
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const LIVE_HUNT = { slug: "campus-night-hunt", id: "", joinCode: "482913" };

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  // Full Chromium in new-headless mode renders like desktop Chrome; fall back to the default.
  browser ??= await chromium.launch({ channel: "chromium" }).catch(() => chromium.launch());
  return browser;
}

export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

export type Who = "anon" | "admin" | "judge" | `player-${1 | 2 | 3 | 4 | 5}`;

/** A fresh browser context signed in as a demo user (or anonymous). */
export async function contextAs(who: Who, opts: { mobile?: boolean } = {}): Promise<BrowserContext> {
  const b = await getBrowser();
  const context = await b.newContext({
    baseURL: BASE,
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1280, height: 860 },
    isMobile: opts.mobile,
    hasTouch: opts.mobile,
  });
  if (who !== "anon") {
    await context.addCookies([{ name: "shp_session", value: `dev-${who}`, url: BASE }]);
  }
  return context;
}

/** Collects console errors, page errors and 5xx responses so tests can assert a clean run. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource.*404/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`http ${r.status()} ${r.url()}`);
  });
  return problems;
}

/** The live demo hunt's id, looked up in the local database the server uses. */
export async function liveHuntId(): Promise<string> {
  if (LIVE_HUNT.id) return LIVE_HUNT.id;
  const { db } = await import("../lib/db");
  const { hunts } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const row = await db.select({ id: hunts.id }).from(hunts).where(eq(hunts.slug, LIVE_HUNT.slug)).get();
  if (!row) throw new Error("Seed the demo data first: bun run db:seed --reset");
  LIVE_HUNT.id = row.id;
  return row.id;
}
