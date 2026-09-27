/**
 * Demo data for development and screenshots.
 *
 *   bun run db:seed            # add demo data (skips if the demo admin exists)
 *   bun run db:seed --reset    # wipe every table and uploads first
 *   bun run db:seed --reset --hours 6   # …and keep the live hunt running for 6 hours
 *
 * Accounts (password in parentheses):
 *   admin@example.com (hunt-admin)   platform admin, owner of every demo hunt
 *   judge@example.com (hunt-judge)   judge on "Campus Night Hunt"
 *
 * Dev session tokens (set cookie shp_session=<token>, see scripts/shot.ts):
 *   dev-admin, dev-judge, dev-player-1 … dev-player-5 (one per team in the live hunt)
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { hashPassword } from "../lib/auth/password";
import { db } from "../lib/db";
import { runMigrations } from "../lib/db/migrate";
import * as s from "../lib/db/schema";
import { env } from "../lib/env";
import { formatTime } from "../lib/format";
import { newCode, newId } from "../lib/ids";
import { storePoster, storeUpload } from "../lib/storage";

const reset = process.argv.includes("--reset");
// --hours N keeps the live demo hunt running for N more hours (default 55 minutes),
// e.g. for long QA sessions.
const hoursArg = process.argv.indexOf("--hours");
const LIVE_MINUTES_LEFT = hoursArg > 0 ? Math.max(1, Number(process.argv[hoursArg + 1]) * 60 || 55) : 55;
const MIN = 60_000;
const now = Date.now();
const at = (offsetMin: number) => new Date(now + offsetMin * MIN);
const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
/** Every demo hunt runs on London time; copy that mentions a time is written from the seeded schedule. */
const TZ = "Europe/London";
const LIVE_STARTED_MIN_AGO = 95;

/** 150 → "Two and a half hours" (to the nearest half hour). */
function hoursInWords(minutes: number): string {
  const words = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
  const halves = Math.max(1, Math.round(minutes / 30));
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (whole === 0) return "Half an hour";
  const n = words[whole] ?? String(whole);
  return half ? `${n} and a half hours` : `${n} ${whole === 1 ? "hour" : "hours"}`;
}

/** Noon on London time, `days` days from now. */
function noonInDays(days: number): Date {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at(days * 24 * 60));
  const utcNoon = Date.parse(`${day}T12:00:00Z`);
  const hourThere = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(utcNoon),
  );
  return new Date(utcNoon - (hourThere - 12) * 60 * MIN);
}

async function wipe() {
  const tables = [
    "push_subscriptions",
    "audit_log",
    "files",
    "announcements",
    "adjustments",
    "hint_unlocks",
    "hints",
    "submissions",
    "players",
    "teams",
    "tasks",
    "invites",
    "hunt_staff",
    "hunts",
    "sessions",
    "settings",
    "users",
  ];
  for (const t of tables) await db.run(sql.raw(`DELETE FROM ${t}`));
  await fs.rm(env.uploadsDir, { recursive: true, force: true });
}

/** A fake "photo": sky, sun, hills and a caption band, in the team's colors. */
async function fakePhoto(seedText: string, hue: number, caption: string): Promise<Blob> {
  const w = 1200;
  const h = 900;
  const sky = `hsl(${hue} 70% 72%)`;
  const sky2 = `hsl(${(hue + 40) % 360} 75% 88%)`;
  const hill = `hsl(${(hue + 150) % 360} 35% 32%)`;
  const hill2 = `hsl(${(hue + 150) % 360} 30% 45%)`;
  const r = [...seedText].reduce((a, c) => a + c.charCodeAt(0), 0);
  const sunX = 200 + (r % 800);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${sunX}" cy="260" r="110" fill="hsl(45 100% 70%)"/>
    <path d="M0 620 Q 300 ${420 + (r % 120)} 600 600 T 1200 560 V 900 H 0 Z" fill="${hill2}"/>
    <path d="M0 720 Q 400 ${560 + (r % 90)} 800 700 T 1200 690 V 900 H 0 Z" fill="${hill}"/>
    <rect y="790" width="${w}" height="110" fill="rgba(0,0,0,0.45)"/>
    <text x="48" y="862" font-family="DejaVu Sans, Arial, sans-serif" font-size="52" font-weight="700" fill="#fff">${caption.replace(/&/g, "&amp;")}</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  return new Blob([new Uint8Array(buf)], { type: "image/jpeg" });
}

/** An EBML element with an 8-byte size (valid, and simple to write). */
function ebml(id: number[], ...body: Buffer[]): Buffer {
  const payload = Buffer.concat(body);
  const size = Buffer.alloc(8);
  size.writeBigUInt64BE(BigInt(payload.length) | (1n << 56n));
  return Buffer.concat([Buffer.from(id), size, payload]);
}
const uintBytes = (n: number, bytes: number) => {
  const b = Buffer.alloc(bytes);
  b.writeUIntBE(n, 0, bytes);
  return b;
};

/**
 * A three-second "video" for video tasks: a WebM slideshow of three VP8 key
 * frames (sharp's lossy WebP is a VP8 frame inside a RIFF wrapper), plus the
 * poster frame the phone would capture.
 */
async function fakeVideo(seedText: string, hue: number, caption: string): Promise<{ video: Blob; poster: Blob }> {
  const [w, h] = [640, 480];
  const frames: Buffer[] = [];
  let poster: Buffer | null = null;
  for (const [i, line] of [caption, `${caption} ♪`, `${caption} ♪ ♪`].entries()) {
    const photo = Buffer.from(await (await fakePhoto(`${seedText}${i}`, hue, line)).arrayBuffer());
    const frame = sharp(photo).resize(w, h);
    poster ??= await frame.clone().jpeg({ quality: 80 }).toBuffer();
    const webp = await frame.webp({ quality: 70 }).toBuffer();
    if (webp.toString("latin1", 12, 16) !== "VP8 ") throw new Error("expected a simple lossy WebP");
    frames.push(webp.subarray(20, 20 + webp.readUInt32LE(16)));
  }
  const duration = Buffer.alloc(8);
  duration.writeDoubleBE(frames.length * 1000);
  const webm = Buffer.concat([
    ebml(
      [0x1a, 0x45, 0xdf, 0xa3], // EBML header
      ebml([0x42, 0x86], uintBytes(1, 1)),
      ebml([0x42, 0xf7], uintBytes(1, 1)),
      ebml([0x42, 0xf2], uintBytes(4, 1)),
      ebml([0x42, 0xf3], uintBytes(8, 1)),
      ebml([0x42, 0x82], Buffer.from("webm")),
      ebml([0x42, 0x87], uintBytes(2, 1)),
      ebml([0x42, 0x85], uintBytes(2, 1)),
    ),
    ebml(
      [0x18, 0x53, 0x80, 0x67], // Segment
      ebml([0x15, 0x49, 0xa9, 0x66], ebml([0x2a, 0xd7, 0xb1], uintBytes(1_000_000, 4)), ebml([0x44, 0x89], duration)),
      ebml(
        [0x16, 0x54, 0xae, 0x6b], // Tracks › TrackEntry: 1, video, VP8, w×h
        ebml(
          [0xae],
          ebml([0xd7], uintBytes(1, 1)),
          ebml([0x73, 0xc5], uintBytes(1, 1)),
          ebml([0x83], uintBytes(1, 1)),
          ebml([0x86], Buffer.from("V_VP8")),
          ebml([0xe0], ebml([0xb0], uintBytes(w, 2)), ebml([0xba], uintBytes(h, 2))),
        ),
      ),
      ebml(
        [0x1f, 0x43, 0xb6, 0x75], // Cluster: one key frame a second
        ebml([0xe7], uintBytes(0, 1)),
        ...frames.map((f, i) => ebml([0xa3], Buffer.from([0x81]), uintBytes(i * 1000, 2), Buffer.from([0x80]), f)),
      ),
    ),
  ]);
  return {
    video: new Blob([new Uint8Array(webm)], { type: "video/webm" }),
    poster: new Blob([new Uint8Array(poster ?? Buffer.alloc(0))], { type: "image/jpeg" }),
  };
}

type TaskSeed = Partial<typeof s.tasks.$inferInsert> & { code: number; title: string };

async function createHunt(opts: {
  hunt: Partial<typeof s.hunts.$inferInsert> & { name: string; slug: string; joinCode: string };
  ownerId: string;
  tasks: TaskSeed[];
}) {
  const [hunt] = await db
    .insert(s.hunts)
    .values({ status: "published", timezone: TZ, createdBy: opts.ownerId, ...opts.hunt })
    .returning();
  await db.insert(s.huntStaff).values({ huntId: hunt.id, userId: opts.ownerId, role: "owner" });
  const tasks = await db
    .insert(s.tasks)
    .values(opts.tasks.map((t, i) => ({ huntId: hunt.id, sortOrder: i, ...t })))
    .returning();
  const byCode = Object.fromEntries(tasks.map((t) => [t.code, t]));
  return { hunt, byCode };
}

async function main() {
  await runMigrations();
  if (reset) await wipe();
  const existing = await db.select().from(s.users).where(eq(s.users.email, "admin@example.com")).get();
  if (existing) {
    console.log("Demo data already present. Run with --reset to recreate it.");
    return;
  }

  // Staff ------------------------------------------------------------------
  const [admin] = await db
    .insert(s.users)
    .values({
      email: "admin@example.com",
      name: "Alex Rivera",
      passwordHash: await hashPassword("hunt-admin"),
      isAdmin: true,
    })
    .returning();
  const [judge] = await db
    .insert(s.users)
    .values({ email: "judge@example.com", name: "Sam Okafor", passwordHash: await hashPassword("hunt-judge") })
    .returning();
  const far = new Date(now + 365 * 24 * 60 * MIN);
  const [adminSession] = await db
    .insert(s.sessions)
    .values({ tokenHash: tokenHash("dev-admin"), userId: admin.id, expiresAt: far })
    .returning();
  await db.insert(s.sessions).values({ tokenHash: tokenHash("dev-judge"), userId: judge.id, expiresAt: far });
  void adminSession;

  // Hunt 1: live ------------------------------------------------------------
  const { hunt: live, byCode } = await createHunt({
    ownerId: admin.id,
    hunt: {
      name: "Campus Night Hunt",
      slug: "campus-night-hunt",
      tagline: `Twelve controls hidden across campus. ${hoursInWords(LIVE_STARTED_MIN_AGO + LIVE_MINUTES_LEFT)}. Bring a torch.`,
      description: `Meet at the **main fountain** at ${formatTime(at(-LIVE_STARTED_MIN_AGO - 15), TZ)} for the briefing.\n\n- Stay together: photos need at least three of you in frame\n- No running inside buildings\n- Checkpoint QR codes are posted at eye level — leave them where they are\n\nStuck? Hints cost points, but they’re cheaper than wandering.`,
      joinCode: "482913",
      startsAt: at(-LIVE_STARTED_MIN_AGO),
      endsAt: at(LIVE_MINUTES_LEFT),
      freezeAt: at(LIVE_MINUTES_LEFT - 15),
      scoreboardVisibility: "public",
      galleryMode: "live",
      accent: "overprint",
      feedbackTemplates: [
        "Great shot!",
        "We can’t see enough of your team — at least three of you in frame, please.",
        "That’s not the right spot. Look again!",
        "Blurry — can you retake it?",
      ],
    },
    tasks: [
      {
        code: 31,
        title: "The red door",
        kind: "media",
        points: 100,
        description: "Find the only red door on the quad. Photo of the whole team in front of it.",
        category: "Around the quad",
      },
      {
        code: 32,
        title: "Statue selfie",
        kind: "media",
        scoring: "race",
        points: 150,
        minPoints: 60,
        decaySolves: 6,
        description: "Recreate the pose of the founder’s statue. The first teams to nail it earn the most.",
        category: "Around the quad",
      },
      {
        code: 33,
        title: "Library riddle",
        kind: "answer",
        points: 80,
        answers: ["gargoyle", "gargoyles"],
        maxAttempts: 5,
        description: "I watch the rain from the library roof but never get wet. What am I?",
        category: "Riddles",
      },
      {
        code: 34,
        title: "Fountain checkpoint",
        kind: "checkpoint",
        points: 50,
        checkpointCode: "FNT7Q2",
        description: "Scan the QR code taped under the fountain’s east bench.",
        category: "Checkpoints",
      },
      {
        code: 35,
        title: "Tallest human tower",
        kind: "contest",
        mediaAccept: "any",
        points: 200,
        minPoints: 60,
        contestPlaces: 3,
        contestRank: "highest",
        contestUnit: "cm",
        description:
          "Build the tallest *safe* tower of people — nobody’s feet above anyone’s shoulders. Film it from the ground; we measure.",
        category: "Contests",
      },
      {
        code: 36,
        title: "Name a constellation",
        kind: "media",
        scoring: "rarity",
        points: 120,
        minPoints: 40,
        decaySolves: 6,
        description: "Photograph a constellation and tell us which one it is. Worth less the more teams manage it.",
        category: "After dark",
      },
      {
        code: 37,
        title: "Echo chamber",
        kind: "media",
        mediaAccept: "video",
        points: 90,
        description: "Find a spot on campus with a real echo. A short video proves it.",
        category: "After dark",
      },
      {
        code: 38,
        title: "Bench poet",
        kind: "media",
        points: 60,
        autoApprove: true,
        description: "Write four lines inspired by a memorial bench plaque. Photo of the plaque, poem in the note.",
        category: "Around the quad",
      },
      {
        code: 39,
        title: "Carved in stone",
        kind: "answer",
        scoring: "race",
        points: 100,
        minPoints: 40,
        decaySolves: 5,
        answers: ["1987"],
        description: "What year is carved above the old gym’s entrance?",
        category: "Riddles",
      },
      {
        code: 40,
        title: "Most bikes in one frame",
        kind: "contest",
        points: 150,
        minPoints: 50,
        contestPlaces: 3,
        contestRank: "highest",
        contestUnit: "bikes",
        description: "One photo, as many bikes in frame as you can. Tell us your count in the note.",
        category: "Contests",
      },
      {
        code: 41,
        title: "Clock tower",
        kind: "checkpoint",
        points: 70,
        checkpointCode: "CLK4M9",
        unlockAt: at(25),
        description: "The clock tower door opens later tonight. Scan the code posted there.",
        category: "Checkpoints",
      },
      {
        code: 42,
        title: "Team chant",
        kind: "media",
        mediaAccept: "video",
        points: 50,
        description: "Ten seconds, all together, as loud as the neighbours allow. Judges award up to 50 points.",
        category: "Bonus",
      },
    ],
  });
  await db.insert(s.huntStaff).values({ huntId: live.id, userId: judge.id, role: "judge" });
  await db.insert(s.hints).values([
    { huntId: live.id, taskId: byCode[33].id, body: "Look up, not down. It has wings.", cost: 10 },
    { huntId: live.id, taskId: byCode[39].id, body: "The gym is the brick building behind the car park.", cost: 15 },
  ]);

  const teamDefs = [
    { name: "Night Owls", emoji: "🦉", color: "plum", hue: 280, players: ["Priya", "Jonas", "Mei"] },
    { name: "Hedgehog Brigade", emoji: "🦔", color: "gold", hue: 40, players: ["Tomás", "Ada", "Kofi", "Lena"] },
    { name: "Lake Otters", emoji: "🦦", color: "lake", hue: 205, players: ["Sofia", "Ben"] },
    { name: "Moss Collective", emoji: "🐸", color: "moss", hue: 120, players: ["Ines", "Noah", "Yuki"] },
    { name: "Rust Buckets", emoji: "🦊", color: "rust", hue: 18, players: ["Omar", "Hana"] },
    { name: "Staff test run", emoji: "🐢", color: "slate", hue: 210, players: ["Alex"], hidden: true },
  ];
  const teams: Record<string, { team: s.Team; players: s.Player[]; hue: number }> = {};
  let playerIndex = 0;
  for (const def of teamDefs) {
    const [team] = await db
      .insert(s.teams)
      .values({
        huntId: live.id,
        name: def.name,
        nameKey: def.name.toLowerCase(),
        emoji: def.emoji,
        color: def.color,
        code: newCode(),
        hidden: def.hidden ?? false,
        origin: def.hidden ? "staff" : "player",
        createdAt: at(-120),
      })
      .returning();
    const players: s.Player[] = [];
    for (const [i, name] of def.players.entries()) {
      let sessionId: string | null = null;
      if (i === 0 && !def.hidden) {
        playerIndex += 1;
        const [sess] = await db
          .insert(s.sessions)
          .values({ tokenHash: tokenHash(`dev-player-${playerIndex}`), expiresAt: far })
          .returning();
        sessionId = sess.id;
      }
      const [p] = await db
        .insert(s.players)
        .values({
          huntId: live.id,
          teamId: team.id,
          name,
          isCaptain: i === 0,
          sessionId,
          createdAt: at(-118),
          seenUpdatesAt: at(-60),
        })
        .returning();
      players.push(p);
    }
    teams[def.name] = { team, players, hue: def.hue };
  }

  type SubSeed = {
    team: string;
    code: number;
    min: number;
    status?: s.SubmissionStatus;
    text?: string;
    photo?: string;
    value?: number;
    feedback?: string;
    override?: number;
    auto?: boolean;
  };
  const subs: SubSeed[] = [
    { team: "Night Owls", code: 31, min: -88, status: "approved", photo: "Red door", feedback: "Great shot!" },
    { team: "Night Owls", code: 32, min: -80, status: "approved", photo: "Statue pose" },
    { team: "Night Owls", code: 33, min: -75, status: "approved", text: "Gargoyle", auto: true },
    { team: "Night Owls", code: 34, min: -70, status: "approved", text: "FNT7Q2", auto: true },
    { team: "Night Owls", code: 35, min: -52, status: "approved", photo: "Human tower", value: 212 },
    { team: "Night Owls", code: 39, min: -40, status: "approved", text: "1987", auto: true },
    { team: "Night Owls", code: 36, min: -9, status: "pending", photo: "Orion", text: "Orion — belt is clear!" },
    { team: "Night Owls", code: 40, min: -4, status: "pending", photo: "Bike rack", text: "We count 31 bikes" },

    { team: "Hedgehog Brigade", code: 31, min: -84, status: "approved", photo: "Red door" },
    { team: "Hedgehog Brigade", code: 32, min: -78, status: "approved", photo: "Statue pose" },
    {
      team: "Hedgehog Brigade",
      code: 33,
      min: -73,
      status: "rejected",
      text: "owl",
      auto: true,
      feedback: "Not quite.",
    },
    { team: "Hedgehog Brigade", code: 33, min: -71, status: "approved", text: "gargoyles", auto: true },
    { team: "Hedgehog Brigade", code: 34, min: -66, status: "approved", text: "FNT7Q2", auto: true },
    { team: "Hedgehog Brigade", code: 35, min: -50, status: "approved", photo: "Human tower", value: 185 },
    {
      team: "Hedgehog Brigade",
      code: 38,
      min: -30,
      status: "approved",
      photo: "Bench plaque",
      text: "Here sat Margaret, who loved the rain…",
      auto: true,
    },
    { team: "Hedgehog Brigade", code: 37, min: -6, status: "pending", photo: "Echo stairwell", text: "Stairwell B!" },

    { team: "Lake Otters", code: 31, min: -60, status: "approved", photo: "Red door" },
    { team: "Lake Otters", code: 33, min: -55, status: "approved", text: "Gargoyle", auto: true },
    { team: "Lake Otters", code: 36, min: -35, status: "approved", photo: "Cassiopeia", text: "Cassiopeia" },
    { team: "Lake Otters", code: 40, min: -28, status: "approved", photo: "Bike rack", value: 23, text: "23 bikes" },
    { team: "Lake Otters", code: 35, min: -12, status: "pending", photo: "Human tower", text: "Three levels!" },

    {
      team: "Moss Collective",
      code: 32,
      min: -70,
      status: "rejected",
      photo: "Statue pose",
      feedback: "We can’t see the statue — step back and try again.",
    },
    { team: "Moss Collective", code: 34, min: -64, status: "approved", text: "FNT7Q2", auto: true },
    { team: "Moss Collective", code: 42, min: -20, status: "approved", photo: "Team chant", override: 35 },
    { team: "Moss Collective", code: 31, min: -2, status: "pending", photo: "Red door" },

    { team: "Rust Buckets", code: 34, min: -44, status: "approved", text: "FNT7Q2", auto: true },
    { team: "Rust Buckets", code: 39, min: -15, status: "approved", text: "1987", auto: true },

    { team: "Staff test run", code: 31, min: -110, status: "approved", photo: "Test" },
  ];

  for (const sub of subs) {
    const t = teams[sub.team];
    const task = byCode[sub.code];
    const status = sub.status ?? "pending";
    const [row] = await db
      .insert(s.submissions)
      .values({
        huntId: live.id,
        taskId: task.id,
        teamId: t.team.id,
        playerId: t.players[0].id,
        text: sub.text ?? null,
        status,
        contestValue: sub.value ?? null,
        pointsOverride: sub.override ?? null,
        feedback: sub.feedback ?? null,
        autoJudged: sub.auto ?? false,
        judgedBy: status !== "pending" && !sub.auto ? judge.id : null,
        judgedAt: status !== "pending" ? at(sub.min + (sub.auto ? 0 : 3)) : null,
        clientId: newId(),
        createdAt: at(sub.min),
      })
      .returning();
    if (sub.photo && task.mediaAccept === "video") {
      // Video-only tasks get a short video (with its poster frame), not a photo.
      const { video, poster } = await fakeVideo(`${sub.team}${sub.code}`, t.hue, sub.photo);
      const file = await storeUpload({
        file: video,
        name: `${sub.photo.toLowerCase().replace(/\s+/g, "-")}.webm`,
        huntId: live.id,
        ownerKind: "submission",
        ownerId: row.id,
        allow: ["video"],
      });
      await storePoster(file, poster);
    } else if (sub.photo) {
      await storeUpload({
        file: await fakePhoto(`${sub.team}${sub.code}`, t.hue, sub.photo),
        name: `${sub.photo.toLowerCase().replace(/\s+/g, "-")}.jpg`,
        huntId: live.id,
        ownerKind: "submission",
        ownerId: row.id,
        allow: ["image", "video"],
      });
    }
  }

  const [hint33] = await db.select().from(s.hints).where(eq(s.hints.taskId, byCode[33].id));
  await db.insert(s.hintUnlocks).values({
    hintId: hint33.id,
    teamId: teams["Lake Otters"].team.id,
    huntId: live.id,
    playerId: teams["Lake Otters"].players[0].id,
    cost: hint33.cost,
    createdAt: at(-57),
  });
  await db.insert(s.adjustments).values([
    {
      huntId: live.id,
      teamId: teams["Night Owls"].team.id,
      points: -20,
      reason: "Ran through the library",
      createdBy: admin.id,
      createdAt: at(-45),
    },
    {
      huntId: live.id,
      teamId: teams["Moss Collective"].team.id,
      points: 25,
      reason: "Helped another team find a lost phone",
      createdBy: admin.id,
      createdAt: at(-25),
    },
  ]);
  await db.insert(s.announcements).values([
    {
      huntId: live.id,
      title: `Clock tower opens at ${formatTime(byCode[41].unlockAt ?? at(25), TZ)}`,
      body: "Control 41, a new checkpoint worth 70 points, appears in your tasks then.",
      pinned: true,
      createdBy: admin.id,
      createdAt: at(-5),
    },
    {
      huntId: live.id,
      title: null,
      body: "Reminder: the hunt ends at the fountain. Late arrivals can’t submit.",
      createdBy: admin.id,
      createdAt: at(-65),
    },
  ]);

  // Hunt 2: upcoming -------------------------------------------------------
  const { hunt: upcoming } = await createHunt({
    ownerId: admin.id,
    hunt: {
      name: "Office Summer Hunt",
      slug: "office-summer-hunt",
      tagline: "Lunchtime hunt around the building. Teams of four, one hour.",
      description: "Register your team now — tasks appear when the hunt starts at noon.",
      joinCode: "705316",
      startsAt: noonInDays(2),
      endsAt: new Date(noonInDays(2).getTime() + 60 * MIN),
      accent: "water",
      maxTeamSize: 4,
      teamCreation: "players",
    },
    tasks: [
      {
        code: 31,
        title: "Plant census",
        kind: "answer",
        points: 60,
        answers: ["14"],
        description: "How many potted plants are on floor 2?",
      },
      {
        code: 32,
        title: "Mug shot",
        kind: "media",
        points: 80,
        description: "The oldest mug in the kitchen, with its owner if you can find them.",
      },
      {
        code: 33,
        title: "Server room door",
        kind: "checkpoint",
        points: 40,
        checkpointCode: "SRV9K3",
        description: "Scan the code on the server room door.",
      },
      {
        code: 34,
        title: "Desk tidy-off",
        kind: "contest",
        contestRank: "highest",
        contestPlaces: 3,
        points: 150,
        minPoints: 50,
        description: "Tidiest desk, judged by the facilities team.",
      },
    ],
  });
  for (const [name, emoji, color] of [
    ["Spreadsheet Sharks", "🦈", "sky"],
    ["The Stapler Liberation Front", "🦝", "coral"],
  ] as const) {
    await db.insert(s.teams).values({
      huntId: upcoming.id,
      name,
      nameKey: name.toLowerCase(),
      emoji,
      color,
      code: newCode(),
    });
  }

  // Hunt 3: finished -------------------------------------------------------
  const { hunt: ended, byCode: endedTasks } = await createHunt({
    ownerId: admin.id,
    hunt: {
      name: "Spring Photo Rally",
      slug: "spring-photo-rally",
      tagline: "A photo hunt through the old town.",
      joinCode: "239871",
      startsAt: at(-31 * 24 * 60),
      endsAt: at(-31 * 24 * 60 + 180),
      accent: "forest",
      galleryMode: "after",
      scoreboardVisibility: "public",
    },
    tasks: [
      { code: 31, title: "Blossom tunnel", kind: "media", points: 100, description: "A path under blossom trees." },
      {
        code: 32,
        title: "Oldest shopfront",
        kind: "media",
        points: 120,
        description: "The oldest shop sign you can find.",
      },
      {
        code: 33,
        title: "Bridge reflection",
        kind: "media",
        points: 90,
        description: "The old bridge, reflected in the river.",
      },
      {
        code: 34,
        title: "Market haggle",
        kind: "media",
        mediaAccept: "video",
        points: 80,
        description: "Haggle (politely) at the market.",
      },
    ],
  });
  const endedTeams = [
    ["Shutterbugs", "🐞", "rose", 340],
    ["Wide Angles", "🦅", "indigo", 230],
    ["F-Stop Foxes", "🦊", "coral", 20],
  ] as const;
  for (const [i, [name, emoji, color, hue]] of endedTeams.entries()) {
    const [team] = await db
      .insert(s.teams)
      .values({ huntId: ended.id, name, nameKey: name.toLowerCase(), emoji, color, code: newCode() })
      .returning();
    const codes = [31, 32, 33].slice(0, 3 - i);
    for (const [j, code] of codes.entries()) {
      const [row] = await db
        .insert(s.submissions)
        .values({
          huntId: ended.id,
          taskId: endedTasks[code].id,
          teamId: team.id,
          status: "approved",
          judgedBy: admin.id,
          judgedAt: at(-31 * 24 * 60 + 30 + j * 20 + 5),
          createdAt: at(-31 * 24 * 60 + 30 + j * 20 + i * 3),
        })
        .returning();
      await storeUpload({
        file: await fakePhoto(`${name}${code}`, hue, endedTasks[code].title),
        name: `${code}.jpg`,
        huntId: ended.id,
        ownerKind: "submission",
        ownerId: row.id,
        allow: ["image"],
      });
    }
  }

  console.log("Seeded demo data:");
  console.log(`  live:     /h/${live.slug}   (join code ${live.joinCode})`);
  console.log(`  upcoming: /h/${upcoming.slug}   (join code ${upcoming.joinCode})`);
  console.log(`  ended:    /h/${ended.slug}`);
  console.log("  staff:    admin@example.com / hunt-admin, judge@example.com / hunt-judge");
}

await main();
process.exit(0);
