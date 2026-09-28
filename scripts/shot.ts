/**
 * Screenshot a page of the running dev server, optionally signed in.
 *
 *   bun scripts/shot.ts /h/campus-night-hunt --as player-1 --mobile
 *   bun scripts/shot.ts /manage/<huntId>/judge --as admin --out .shots/judge.png
 *   bun scripts/shot.ts /styleguide --dark --full
 *
 * Options
 *   --as <who>     admin | judge | player-1 … player-5 (dev session tokens from scripts/seed.ts)
 *   --mobile       390×844 phone viewport (default: 1440×900 desktop)
 *   --width N      custom viewport width (height 900)
 *   --dark         prefers-color-scheme: dark
 *   --full         full-page screenshot
 *   --wait N       extra milliseconds to wait before capturing (default 400)
 *   --out <file>   output path (default .shots/<slugified-path>[-mobile][-dark].png)
 *   --base <url>   server origin (default http://localhost:3000)
 *
 * Prints the output path, plus any console errors and failed requests seen
 * while loading. When several agents share one machine, serialize runs:
 *   flock /tmp/shp-shot.lock bun scripts/shot.ts …
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--") && !isValue(a)) ?? "/";
function isValue(a: string) {
  const i = args.indexOf(a);
  return i > 0 && ["--as", "--width", "--wait", "--out", "--base"].includes(args[i - 1]);
}
function opt(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const flag = (name: string) => args.includes(name);

const base = opt("--base") ?? "http://localhost:3000";
const who = opt("--as");
const mobile = flag("--mobile");
const dark = flag("--dark");
const width = opt("--width") ? Number(opt("--width")) : mobile ? 390 : 1440;
const height = mobile ? 844 : 900;
const wait = Number(opt("--wait") ?? 400);
const slug =
  target
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+$/, "") || "home";
const out =
  opt("--out") ??
  path.join(".shots", `${slug}${who ? `-${who}` : ""}${mobile ? "-mobile" : ""}${dark ? "-dark" : ""}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });

// Full Chromium in new-headless mode renders text like desktop Chrome (the headless shell does not).
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  colorScheme: dark ? "dark" : "light",
});
if (who) {
  await context.addCookies([{ name: "shp_session", value: `dev-${who}`, url: base }]);
}
const page = await context.newPage();
const problems: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
page.on("response", (r) => {
  if (r.status() >= 500) problems.push(`http ${r.status()}: ${r.url()}`);
});

const res = await page.goto(new URL(target, base).toString(), { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(wait);
await page.screenshot({ path: out, fullPage: flag("--full") });
console.log(out);
console.log(`status ${res?.status()} ${page.url()}`);
for (const p of problems) console.log(p);
await browser.close();
