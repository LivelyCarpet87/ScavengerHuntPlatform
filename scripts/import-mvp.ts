/**
 * Imports an event from the original MVP (its data.db and uploads/ folder)
 * as a new hunt, so past events and their photos carry over.
 *
 *   bun scripts/import-mvp.ts --db ./old/data.db --uploads ./old/uploads \
 *     --name "Spring Hunt 2025" --owner you@example.com [--slug spring-hunt-2025] [--dry-run]
 *
 * How the MVP's data maps onto the new model:
 *   challenges     → photo/video tasks. Their decaying value (maxPts → minPts
 *                    over solveThresh solves, shared by every solver) becomes
 *                    "rarity" scoring; equal max/min becomes fixed points.
 *   competitions   → contest tasks. rankSystem MAX/MIN/MAX_SUM/FIRST becomes
 *                    highest/lowest/total/earliest; solveThresh becomes the
 *                    number of scoring places.
 *   accounts       → teams (priv < 5). Players rejoin with their team code —
 *                    print team cards from the Teams page after importing.
 *   submissions    → submissions. approval 1 / −1 / 0 → accepted / not
 *                    accepted / in review. A competition entry's pts becomes
 *                    its contest value (that is how the MVP ranked them).
 *   files          → task attachments and submission photos/videos.
 *
 * Admin accounts are not imported: the MVP stored bcrypt hashes and the new
 * platform has proper staff accounts. The --owner user (create one first via
 * /setup or /signup) owns the imported hunt. The hunt is created as a draft
 * so you can review it before publishing.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Client, createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { runMigrations } from "../lib/db/migrate";
import { huntStaff, hunts, submissions, tasks, teams, users } from "../lib/db/schema";
import { newCode, newJoinCode, slugify } from "../lib/ids";
import { TEAM_COLOR_KEYS, TEAM_EMOJI } from "../lib/palette";
import { hashString } from "../lib/seeded";
import { storeUpload, UploadError } from "../lib/storage";

const { values: args } = parseArgs({
  options: {
    db: { type: "string" },
    uploads: { type: "string" },
    name: { type: "string" },
    owner: { type: "string" },
    slug: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

function usage(message?: string): never {
  if (message) console.error(`\n  ${message}\n`);
  console.error(
    "Usage: bun scripts/import-mvp.ts --db <path/to/data.db> --owner <email> [--uploads <dir>] [--name <hunt name>] [--slug <slug>] [--dry-run]",
  );
  process.exit(message ? 1 : 0);
}

if (args.help) usage();
if (!args.db) usage("--db is required (the MVP's data.db).");
if (!args.owner) usage("--owner is required (email of an existing staff account).");

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** MVP timestamps are SQLite CURRENT_TIMESTAMP strings in UTC ("2025-04-05 18:02:11"). */
function parseMvpTime(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000);
  const s = String(v).trim();
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(s)
    ? `${s.replace(" ", "T")}${/Z|[+-]\d{2}:?\d{2}$/.test(s) ? "" : "Z"}`
    : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The MVP stored uploads as <fileGUID><last extension of the original name>. */
function storedName(fileGUID: string, filename: string): string {
  const m = /.*(\.[A-Za-z0-9]+)/.exec(filename);
  return `${fileGUID}${m ? m[1] : ""}`;
}

async function tableNames(client: Client): Promise<Set<string>> {
  const rs = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(rs.rows.map((r) => String(r.name)));
}

async function all(client: Client, sql: string): Promise<Row[]> {
  const rs = await client.execute(sql);
  return rs.rows as unknown as Row[];
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; await db.select({ id: hunts.id }).from(hunts).where(eq(hunts.slug, slug)).get(); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

async function uniqueJoinCode(): Promise<string> {
  for (;;) {
    const code = newJoinCode();
    if (!(await db.select({ id: hunts.id }).from(hunts).where(eq(hunts.joinCode, code)).get())) return code;
  }
}

async function main() {
  const dbPath = path.resolve(args.db as string);
  const uploadsDir = args.uploads ? path.resolve(args.uploads) : path.join(path.dirname(dbPath), "uploads");
  const dryRun = args["dry-run"];

  await runMigrations();
  const owner = await db
    .select()
    .from(users)
    .where(eq(users.email, (args.owner as string).trim().toLowerCase()))
    .get();
  if (!owner) usage(`No staff account with email ${args.owner}. Create one at /setup (first run) or /signup first.`);

  const old = createClient({ url: `file:${dbPath}` });
  const present = await tableNames(old);
  for (const t of ["accounts", "challenges", "submissions"]) {
    if (!present.has(t)) usage(`${dbPath} doesn't look like an MVP database (missing table "${t}").`);
  }

  const accounts = await all(old, "SELECT * FROM accounts");
  const challenges = await all(old, "SELECT * FROM challenges ORDER BY maxPts + minPts DESC");
  const competitions = present.has("competitions")
    ? await all(old, "SELECT * FROM competitions ORDER BY maxPts + minPts DESC")
    : [];
  const subs = await all(old, "SELECT * FROM submissions ORDER BY time ASC");
  const fileRows = present.has("files") ? await all(old, "SELECT * FROM files") : [];

  const teamAccounts = accounts.filter((a) => num(a.priv) < 5);
  const staffAccounts = accounts.filter((a) => num(a.priv) >= 5);
  console.log(
    `Found ${challenges.length} challenges, ${competitions.length} competitions, ${teamAccounts.length} teams, ${subs.length} submissions, ${fileRows.length} files.`,
  );
  if (dryRun) {
    console.log("Dry run — nothing was written.");
    return;
  }

  const name = args.name?.trim() || process.env.EVENT_NAME || "Imported hunt";
  const firstTime = subs.map((s) => parseMvpTime(s.time)).find(Boolean) ?? null;
  const lastTime =
    [...subs]
      .reverse()
      .map((s) => parseMvpTime(s.time))
      .find(Boolean) ?? null;
  const [hunt] = await db
    .insert(hunts)
    .values({
      name,
      slug: await uniqueSlug(slugify(args.slug || name)),
      joinCode: await uniqueJoinCode(),
      status: "draft",
      description: `Imported from the original platform on ${new Date().toISOString().slice(0, 10)}.`,
      startsAt: firstTime,
      endsAt: lastTime,
      createdBy: owner.id,
      galleryMode: "after",
    })
    .returning();
  await db.insert(huntStaff).values({ huntId: hunt.id, userId: owner.id, role: "owner" });

  // Tasks ---------------------------------------------------------------------
  const taskByOldId = new Map<string, string>();
  const kindByOldId = new Map<string, "media" | "contest">();
  let code = 31;
  for (const c of challenges) {
    const max = Math.max(0, num(c.maxPts, 100));
    const min = Math.min(max, Math.max(0, num(c.minPts, max)));
    const [t] = await db
      .insert(tasks)
      .values({
        huntId: hunt.id,
        code: code++,
        title: str(c.challengeName).trim().slice(0, 120) || `Task ${code - 1}`,
        description: str(c.description),
        kind: "media",
        mediaAccept: "any",
        scoring: max === min ? "fixed" : "rarity",
        points: max,
        minPoints: min,
        decaySolves: Math.max(2, num(c.solveThresh, 10)),
        unlockAt: num(c.unlocked) ? null : parseMvpTime(c.unlockTime),
        sortOrder: code,
      })
      .returning();
    taskByOldId.set(str(c.challGUID), t.id);
    kindByOldId.set(str(c.challGUID), "media");
  }
  const rankMap = { MAX: "highest", MIN: "lowest", MAX_SUM: "total", FIRST: "earliest" } as const;
  for (const c of competitions) {
    const max = Math.max(0, num(c.maxPts, 100));
    const min = Math.min(max, Math.max(0, num(c.minPts, 0)));
    const [t] = await db
      .insert(tasks)
      .values({
        huntId: hunt.id,
        code: code++,
        title: str(c.compName).trim().slice(0, 120) || `Contest ${code - 1}`,
        description: str(c.description),
        kind: "contest",
        mediaAccept: "any",
        points: max,
        minPoints: min,
        contestRank: rankMap[str(c.rankSystem) as keyof typeof rankMap] ?? "highest",
        contestPlaces: Math.min(20, Math.max(1, num(c.solveThresh, 3))),
        unlockAt: num(c.unlocked) ? null : parseMvpTime(c.unlockTime),
        sortOrder: code,
      })
      .returning();
    taskByOldId.set(str(c.compGUID), t.id);
    kindByOldId.set(str(c.compGUID), "contest");
  }

  // Teams ---------------------------------------------------------------------
  const teamByAccount = new Map<string, string>();
  const usedNames = new Set<string>();
  for (const a of teamAccounts) {
    let teamName = str(a.acctName).trim().slice(0, 32) || "Team";
    for (let i = 2; usedNames.has(teamName.toLowerCase()); i++)
      teamName = `${str(a.acctName).trim().slice(0, 28)} (${i})`;
    usedNames.add(teamName.toLowerCase());
    const h = hashString(str(a.acctGUID) || teamName);
    const [team] = await db
      .insert(teams)
      .values({
        huntId: hunt.id,
        name: teamName,
        nameKey: teamName.toLowerCase(),
        emoji: TEAM_EMOJI[h % TEAM_EMOJI.length],
        color: TEAM_COLOR_KEYS[h % TEAM_COLOR_KEYS.length],
        code: newCode(),
        origin: "staff",
      })
      .returning();
    teamByAccount.set(str(a.acctGUID), team.id);
  }

  // Submissions -----------------------------------------------------------------
  const subByOldId = new Map<string, string>();
  let skipped = 0;
  for (const s of subs) {
    const oldTask = str(s.challGUID) || str(s.compGUID);
    const taskId = taskByOldId.get(oldTask);
    const teamId = teamByAccount.get(str(s.acctGUID));
    if (!taskId || !teamId) {
      skipped++;
      continue;
    }
    const approval = num(s.approval);
    const status = approval > 0 ? "approved" : approval < 0 ? "rejected" : "pending";
    const at = parseMvpTime(s.time) ?? new Date();
    const isContest = kindByOldId.get(oldTask) === "contest";
    const [row] = await db
      .insert(submissions)
      .values({
        huntId: hunt.id,
        taskId,
        teamId,
        text: str(s.description) || null,
        status,
        contestValue: isContest && s.pts != null && s.pts !== "" ? num(s.pts) : null,
        feedback: str(s.feedback) || null,
        judgedAt: status === "pending" ? null : at,
        createdAt: at,
      })
      .returning();
    subByOldId.set(str(s.submGUID), row.id);
  }

  // Files -----------------------------------------------------------------------
  let copied = 0;
  let missing = 0;
  for (const f of fileRows) {
    const assoc = str(f.assocGUID);
    const owner = subByOldId.has(assoc)
      ? ({ ownerKind: "submission", ownerId: subByOldId.get(assoc) as string } as const)
      : taskByOldId.has(assoc)
        ? ({ ownerKind: "task", ownerId: taskByOldId.get(assoc) as string } as const)
        : null;
    if (!owner) continue;
    const onDisk = path.join(uploadsDir, storedName(str(f.fileGUID), str(f.filename)));
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(onDisk);
    } catch {
      missing++;
      continue;
    }
    try {
      await storeUpload({
        file: new Blob([new Uint8Array(bytes)]),
        name: str(f.filename),
        huntId: hunt.id,
        ownerKind: owner.ownerKind,
        ownerId: owner.ownerId,
        allow: ["image", "video", "audio", "document"],
        maxBytes: Number.MAX_SAFE_INTEGER,
      });
      copied++;
    } catch (err) {
      if (err instanceof UploadError) {
        console.warn(`  skipped ${f.filename}: ${err.message}`);
        missing++;
      } else throw err;
    }
  }

  console.log(`\nImported "${hunt.name}" as a draft.`);
  console.log(
    `  ${challenges.length + competitions.length} tasks, ${teamAccounts.length} teams, ${subByOldId.size} submissions, ${copied} files`,
  );
  if (skipped) console.log(`  ${skipped} submissions skipped (unknown team or task)`);
  if (missing) console.log(`  ${missing} files missing or unreadable in ${uploadsDir}`);
  if (staffAccounts.length) {
    console.log(
      `  Not imported: ${staffAccounts.length} admin account(s) (${staffAccounts.map((a) => str(a.acctName)).join(", ")}). Invite them from the hunt's Settings.`,
    );
  }
  console.log(`\n  Review it: /manage/${hunt.id}   Players: /h/${hunt.slug} (join code ${hunt.joinCode})`);
  console.log("  Teams rejoin with their team codes: print team cards from the Teams page.");
}

await main();
process.exit(0);
