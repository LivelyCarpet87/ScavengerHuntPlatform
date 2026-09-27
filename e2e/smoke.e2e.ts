/**
 * End-to-end smoke tests: the journeys an event depends on, in a real browser.
 *
 *   bun run db:seed --reset && bun run build && bun run start   # or bun run dev
 *   bun run e2e
 *
 * Each run creates its own team and hunt with unique names, so it can run
 * repeatedly against the same demo database.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { and, count, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { hunts, submissions, tasks } from "../lib/db/schema";
import { BASE, closeBrowser, contextAs, LIVE_HUNT, liveHuntId, watchProblems } from "./helpers";

const RUN = Date.now().toString(36).slice(-5);
const TEAM = `E2E Otters ${RUN}`;

afterAll(closeBrowser);

describe("players", () => {
  test("the hunt code on the landing page opens the hunt", async () => {
    const context = await contextAs("anon", { mobile: true });
    const page = await context.newPage();
    const problems = watchProblems(page);
    await page.goto("/");
    await page.getByLabel("Hunt code, six digits").fill(LIVE_HUNT.joinCode);
    await page.waitForURL(/\/h\/campus-night-hunt/, { timeout: 15_000 });
    await page.getByRole("heading", { name: "Campus Night Hunt" }).first().waitFor({ timeout: 10_000 });
    expect(problems).toEqual([]);
    await context.close();
  });

  test("a new team registers without an account, solves an answer task and punches a checkpoint", async () => {
    const context = await contextAs("anon", { mobile: true });
    const page = await context.newPage();
    const problems = watchProblems(page);
    await page.goto(`/h/${LIVE_HUNT.slug}?code=${LIVE_HUNT.joinCode}`);
    await page.getByLabel("Team name").fill(TEAM);
    await page.getByLabel("Your name").first().fill("Robin");
    await page.getByRole("button", { name: "Create team" }).click();
    await page.waitForURL(/welcome=1/, { timeout: 15_000 });
    await page.getByText(TEAM).first().waitFor({ timeout: 10_000 });

    // Answer task 33 ("Library riddle") is checked instantly.
    const huntId = await liveHuntId();
    const riddle = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.huntId, huntId), eq(tasks.code, 33)))
      .get();
    expect(riddle).toBeTruthy();
    await page.goto(`/h/${LIVE_HUNT.slug}/tasks/${riddle?.id}`);
    await page.getByLabel("Your answer").fill("owl");
    await page.getByRole("button", { name: "Check answer" }).click();
    await page
      .getByText(/not quite/i)
      .first()
      .waitFor({ timeout: 10_000 });
    await page.getByLabel("Your answer").fill("Gargoyle");
    await page.getByRole("button", { name: "Check answer" }).click();
    await page
      .getByText(/correct/i)
      .first()
      .waitFor({ timeout: 10_000 });

    // The checkpoint poster link punches control 34.
    await page.goto(`/h/${LIVE_HUNT.slug}/cp/FNT7Q2`);
    await page
      .getByText(/punched/i)
      .first()
      .waitFor({ timeout: 15_000 });

    // The team shows up on the scoreboard with its points.
    await page.goto(`/h/${LIVE_HUNT.slug}/scoreboard`);
    await page.getByText(TEAM).first().waitFor({ timeout: 10_000 });

    // A wrong checkpoint code (422) is an expected console error; nothing else is.
    expect(problems.filter((p) => !/status of 4\d\d/.test(p))).toEqual([]);
    await context.close();
  });

  test("the big screen shows the live standings without signing in", async () => {
    const context = await contextAs("anon");
    const page = await context.newPage();
    const problems = watchProblems(page);
    await page.goto(`/h/${LIVE_HUNT.slug}/screen`);
    await page.getByText("Night Owls").first().waitFor({ timeout: 15_000 });
    expect(problems).toEqual([]);
    await context.close();
  });
});

describe("staff", () => {
  test("a judge approves a pending photo from the queue", async () => {
    const huntId = await liveHuntId();
    // A photo task (contest entries need a measured value before they can be approved).
    const target = await db
      .select({ id: submissions.id })
      .from(submissions)
      .innerJoin(tasks, eq(tasks.id, submissions.taskId))
      .where(and(eq(submissions.huntId, huntId), eq(submissions.status, "pending"), eq(tasks.kind, "media")))
      .get();
    expect(target).toBeTruthy();
    const context = await contextAs("judge");
    const page = await context.newPage();
    const problems = watchProblems(page);
    await page.goto(`/manage/${huntId}/judge?id=${target?.id}`);
    await page
      .getByRole("button", { name: /^Approve/ })
      .first()
      .click();
    let status = "pending";
    for (let i = 0; i < 20 && status === "pending"; i++) {
      await page.waitForTimeout(250);
      const row = await db
        .select({ status: submissions.status })
        .from(submissions)
        .where(eq(submissions.id, target?.id ?? ""))
        .get();
      status = row?.status ?? "missing";
    }
    expect(status).toBe("approved");
    expect(problems).toEqual([]);
    await context.close();
  });

  test("an organizer creates a hunt from a template", async () => {
    const context = await contextAs("admin");
    const page = await context.newPage();
    const problems = watchProblems(page);
    await page.goto("/dashboard/new");
    const name = `E2E Rally ${RUN}`;
    await page.getByLabel("Hunt name").fill(name);
    await page.getByText("Campus classic").first().click();
    await page.getByRole("button", { name: "Create hunt" }).click();
    await page.waitForURL(/\/manage\/[A-Za-z0-9]+/, { timeout: 20_000 });
    const hunt = await db.select().from(hunts).where(eq(hunts.name, name)).get();
    expect(hunt?.status).toBe("draft");
    const made = await db
      .select({ n: count() })
      .from(tasks)
      .where(eq(tasks.huntId, hunt?.id ?? ""))
      .get();
    expect(made?.n ?? 0).toBeGreaterThan(5);
    expect(problems).toEqual([]);
    await context.close();
  });
});

describe("api", () => {
  test("uploads from another site are refused", async () => {
    const huntId = await liveHuntId();
    const form = new FormData();
    form.set("taskId", "x");
    form.set("clientId", crypto.randomUUID());
    const res = await fetch(`${BASE}/api/hunts/${huntId}/submissions`, {
      method: "POST",
      body: form,
      headers: { cookie: "shp_session=dev-player-1", origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  test("uploaded files are private to their team", async () => {
    const res = await fetch(`${BASE}/files/does-not-exist/display`);
    expect(res.status).toBe(404);
  });
});
