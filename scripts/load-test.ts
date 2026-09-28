/**
 * Simulates a busy event against a running server: many teams submitting
 * answers and photos while phones keep live-update streams open.
 *
 *   bun scripts/load-test.ts --hunt campus-night-hunt --teams 60 --seconds 60 [--base http://localhost:3000] [--listeners 150]
 *
 * It creates throwaway teams + device sessions directly in the database
 * (named "Load test NN", hidden from the scoreboard) and removes them after.
 * Run it against `bun run build && bun run start`, not the dev server.
 */
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { and, eq, inArray, like } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../lib/db";
import { hunts, players, sessions, tasks, teams } from "../lib/db/schema";
import { newCode, newToken } from "../lib/ids";

const { values: args } = parseArgs({
  options: {
    hunt: { type: "string", default: "campus-night-hunt" },
    teams: { type: "string", default: "40" },
    seconds: { type: "string", default: "45" },
    listeners: { type: "string", default: "100" },
    base: { type: "string", default: "http://localhost:3000" },
  },
});
const base = args.base as string;
const teamCount = Number(args.teams);
const seconds = Number(args.seconds);
const listenerCount = Number(args.listeners);

const hunt = await db
  .select()
  .from(hunts)
  .where(eq(hunts.slug, args.hunt as string))
  .get();
if (!hunt) throw new Error(`No hunt with slug ${args.hunt}`);
const huntId = hunt.id;
const huntTasks = await db.select().from(tasks).where(eq(tasks.huntId, hunt.id));
const answerTasks = huntTasks.filter((t) => t.kind === "answer" && t.answers.length > 0 && !t.hidden);
const mediaTasks = huntTasks.filter((t) => t.kind === "media" && !t.hidden && !t.unlockAt);
if (!answerTasks.length && !mediaTasks.length) throw new Error("The hunt needs visible answer or photo tasks.");

// Throwaway teams and device sessions --------------------------------------------
const tokens: { token: string; teamId: string }[] = [];
const createdTeams: string[] = [];
const createdSessions: string[] = [];
for (let i = 0; i < teamCount; i++) {
  const name = `Load test ${String(i + 1).padStart(3, "0")}`;
  const [team] = await db
    .insert(teams)
    .values({
      huntId: hunt.id,
      name,
      nameKey: name.toLowerCase(),
      emoji: "🐜",
      color: "slate",
      code: newCode(),
      hidden: true,
      origin: "staff",
    })
    .returning();
  const token = newToken(40);
  const [session] = await db
    .insert(sessions)
    .values({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600_000),
    })
    .returning();
  await db.insert(players).values({ huntId: hunt.id, teamId: team.id, sessionId: session.id, name: "Bot" });
  tokens.push({ token, teamId: team.id });
  createdTeams.push(team.id);
  createdSessions.push(session.id);
}

const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#6a8" } })
  .jpeg({ quality: 80 })
  .toBuffer();

// Live listeners -----------------------------------------------------------------
let eventsReceived = 0;
const controllers: AbortController[] = [];
for (let i = 0; i < listenerCount; i++) {
  const ctrl = new AbortController();
  controllers.push(ctrl);
  const { token } = tokens[i % tokens.length];
  fetch(`${base}/api/hunts/${hunt.id}/events`, { headers: { cookie: `shp_session=${token}` }, signal: ctrl.signal })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) return;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        eventsReceived += new TextDecoder().decode(value).split("event: hunt").length - 1;
      }
    })
    .catch(() => {});
}

// Submitters ---------------------------------------------------------------------
const latencies: number[] = [];
const statuses = new Map<number, number>();
const deadline = Date.now() + seconds * 1000;

async function submitLoop({ token }: { token: string }) {
  while (Date.now() < deadline) {
    const useAnswer = answerTasks.length > 0 && (mediaTasks.length === 0 || Math.random() < 0.5);
    const task = useAnswer
      ? answerTasks[Math.floor(Math.random() * answerTasks.length)]
      : mediaTasks[Math.floor(Math.random() * mediaTasks.length)];
    const form = new FormData();
    form.set("taskId", task.id);
    form.set("clientId", crypto.randomUUID());
    if (useAnswer) form.set("text", Math.random() < 0.3 ? task.answers[0] : "wrong guess");
    else form.append("files", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "photo.jpg");
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}/api/hunts/${huntId}/submissions`, {
        method: "POST",
        body: form,
        headers: { cookie: `shp_session=${token}`, origin: base },
      });
      await res.arrayBuffer();
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    } catch {
      statuses.set(0, (statuses.get(0) ?? 0) + 1);
    }
    latencies.push(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500));
  }
}

const standingsLatency: number[] = [];
async function standingsLoop() {
  while (Date.now() < deadline) {
    const t0 = performance.now();
    await fetch(`${base}/api/hunts/${huntId}/standings`, { headers: { cookie: `shp_session=${tokens[0].token}` } })
      .then((r) => r.arrayBuffer())
      .catch(() => {});
    standingsLatency.push(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 250));
  }
}

console.log(
  `Load test: ${teamCount} teams submitting, ${listenerCount} live listeners, ${seconds}s against ${base} (${hunt.name})`,
);
await Promise.all([...tokens.map(submitLoop), standingsLoop()]);
for (const c of controllers) c.abort();

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(0) : "–";
};
console.log(`Submissions: ${latencies.length} in ${seconds}s (${(latencies.length / seconds).toFixed(1)}/s)`);
console.log(`  latency p50 ${pct(latencies, 50)} ms, p95 ${pct(latencies, 95)} ms, max ${pct(latencies, 100)} ms`);
console.log(
  `  statuses: ${[...statuses.entries()]
    .sort()
    .map(([s, n]) => `${s || "network error"}×${n}`)
    .join(", ")}`,
);
console.log(
  `Standings reads: ${standingsLatency.length}, p50 ${pct(standingsLatency, 50)} ms, p95 ${pct(standingsLatency, 95)} ms`,
);
console.log(`Live events delivered: ${eventsReceived}`);

// Clean up -----------------------------------------------------------------------
await db.delete(teams).where(and(eq(teams.huntId, hunt.id), inArray(teams.id, createdTeams)));
await db.delete(sessions).where(inArray(sessions.id, createdSessions));
await db.delete(teams).where(and(eq(teams.huntId, hunt.id), like(teams.name, "Load test %")));
console.log("Removed the load-test teams.");
process.exit(0);
