import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "../ids";

/*
 * Data model
 * ----------
 * Platform:  users (organizers/judges) · sessions (one per device) · settings
 * Hunt:      hunts ─┬─ hunt_staff (user roles per hunt)
 *                   ├─ teams ── players (a device session's identity in one hunt)
 *                   ├─ tasks ── hints ── hint_unlocks
 *                   ├─ submissions (team proof for a task, judged by staff)
 *                   ├─ adjustments (manual bonus/penalty) · announcements
 *                   └─ files (uploads owned by a submission, task or hunt) · audit_log
 *
 * Every hunt-scoped row carries hunt_id so queries never cross hunts.
 * Timestamps are stored as integer milliseconds (drizzle maps them to Date).
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => newId());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () =>
  ts("created_at")
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
const bool = (name: string) => integer(name, { mode: "boolean" });

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export const users = sqliteTable(
  "users",
  {
    id: id(),
    /** Always stored lowercased and trimmed. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** Platform admins can see and manage every hunt. The first account is an admin. */
    isAdmin: bool("is_admin").notNull().default(false),
    /**
     * May create (and duplicate) hunts. Granted to accounts made through open sign-up
     * or a platform invite; accounts made through a hunt's judge invite only get that
     * hunt. Admins can always create hunts.
     */
    canCreateHunts: bool("can_create_hunts").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/**
 * A session represents one device/browser. Players are attached to a session
 * per hunt; a staff login attaches a user to the same session.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    /** sha256 of the cookie token. The raw token never touches the database. */
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at")
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

/** Platform-wide key/value settings (signup mode, generated VAPID keys, …). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
});

// ---------------------------------------------------------------------------
// Hunts
// ---------------------------------------------------------------------------

export const HUNT_STATUSES = ["draft", "published", "archived"] as const;
export const JOIN_MODES = ["code", "open"] as const;
export const TEAM_CREATION = ["players", "organizers"] as const;
export const SCOREBOARD_VISIBILITY = ["public", "players", "staff"] as const;
export const GALLERY_MODES = ["off", "after", "live"] as const;
export const ACCENTS = ["overprint", "water", "forest", "contour", "sun", "ink"] as const;

export const hunts = sqliteTable(
  "hunts",
  {
    id: id(),
    /** URL segment for players: /h/[slug]. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline"),
    /** Markdown shown on the hunt landing page (intro, rules, meeting point). */
    description: text("description").notNull().default(""),
    /** draft: only staff can see it · published: players can join · archived: read-only, hidden from lists. */
    status: text("status", { enum: HUNT_STATUSES }).notNull().default("draft"),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    /** IANA zone used to print absolute times on the server. */
    timezone: text("timezone").notNull().default("UTC"),
    /** 6-digit code players type or scan to find the hunt. */
    joinCode: text("join_code").notNull(),
    /** code: the hunt code (or a link/QR carrying it) is required to register · open: the link alone is enough. */
    joinMode: text("join_mode", { enum: JOIN_MODES }).notNull().default("code"),
    /** Who may create teams. With "organizers", players can only join teams via team code/QR. */
    teamCreation: text("team_creation", { enum: TEAM_CREATION }).notNull().default("players"),
    /** When false, nobody can register a new team or join via the hunt code. Team codes still work. */
    registrationOpen: bool("registration_open").notNull().default(true),
    maxTeamSize: integer("max_team_size"),
    scoreboardVisibility: text("scoreboard_visibility", { enum: SCOREBOARD_VISIBILITY }).notNull().default("players"),
    /** Players (and the public board) see standings as of this moment; staff always see live. */
    freezeAt: ts("freeze_at"),
    /** Photo gallery of accepted submissions: off, after the hunt ends, or live during it. */
    galleryMode: text("gallery_mode", { enum: GALLERY_MODES }).notNull().default("after"),
    accent: text("accent", { enum: ACCENTS }).notNull().default("overprint"),
    coverFileId: text("cover_file_id"),
    /** Canned judge feedback shown as one-tap chips in the judging queue. */
    feedbackTemplates: text("feedback_templates", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("hunts_slug_uq").on(t.slug), uniqueIndex("hunts_join_code_uq").on(t.joinCode)],
);

export const STAFF_ROLES = ["owner", "organizer", "judge"] as const;

export const huntStaff = sqliteTable(
  "hunt_staff",
  {
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: STAFF_ROLES }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.huntId, t.userId] }), index("hunt_staff_user_idx").on(t.userId)],
);

/**
 * Invite links for staff. With a hunt, accepting grants `role` on that hunt.
 * Without a hunt, it lets someone create an organizer account while signup is closed.
 */
export const invites = sqliteTable(
  "invites",
  {
    /** The token in the invite URL. */
    id: text("id").primaryKey(),
    huntId: text("hunt_id").references(() => hunts.id, { onDelete: "cascade" }),
    role: text("role", { enum: STAFF_ROLES }).notNull().default("judge"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    expiresAt: ts("expires_at"),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("invites_hunt_idx").on(t.huntId)],
);

// ---------------------------------------------------------------------------
// Teams & players
// ---------------------------------------------------------------------------

export const teams = sqliteTable(
  "teams",
  {
    id: id(),
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Normalized name for case-insensitive uniqueness within a hunt. */
    nameKey: text("name_key").notNull(),
    emoji: text("emoji").notNull(),
    /** Key into TEAM_COLORS (lib/palette.ts). */
    color: text("color").notNull(),
    /** 6-character code teammates use to join (also encoded in the team QR). */
    code: text("code").notNull(),
    /** Hidden teams (e.g. staff test runs) are excluded from standings and solve counts. */
    hidden: bool("hidden").notNull().default(false),
    origin: text("origin", { enum: ["player", "staff"] })
      .notNull()
      .default("player"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("teams_hunt_idx").on(t.huntId),
    uniqueIndex("teams_hunt_code_uq").on(t.huntId, t.code),
    uniqueIndex("teams_hunt_name_uq").on(t.huntId, t.nameKey),
  ],
);

export const players = sqliteTable(
  "players",
  {
    id: id(),
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** The device this player is signed in on. Null after the session expires or they sign out. */
    sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    isCaptain: bool("is_captain").notNull().default(false),
    /** Announcements/results newer than this show as unread in Updates. */
    seenUpdatesAt: ts("seen_updates_at"),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("players_team_idx").on(t.teamId),
    uniqueIndex("players_hunt_session_uq").on(t.huntId, t.sessionId),
    // "Your hunts" on the landing page, and clearing sessions: every hunt this device plays in.
    index("players_session_idx").on(t.sessionId),
  ],
);

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * media:      upload a photo and/or video as proof; judged by staff (or auto-accepted)
 * answer:     type an answer; auto-checked against `answers`, or judged when none are set
 * checkpoint: scan the QR (or type the code) posted at a physical location
 * contest:    teams submit entries, judges record a value, top places earn points
 */
export const TASK_KINDS = ["media", "answer", "checkpoint", "contest"] as const;
export const MEDIA_ACCEPT = ["photo", "video", "any"] as const;
export const ANSWER_MATCH = ["loose", "exact", "regex"] as const;
/**
 * fixed:  every solving team earns `points`
 * rarity: value drops for everyone as more teams solve (CTF-style dynamic scoring)
 * race:   earlier solvers earn more; the n-th team to solve gets value(n)
 */
export const SCORING_MODES = ["fixed", "rarity", "race"] as const;
export const CONTEST_RANKS = ["highest", "lowest", "total", "earliest"] as const;

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    /** Control code shown on the control marker, e.g. 31. Unique within the hunt. */
    code: integer("code").notNull(),
    title: text("title").notNull(),
    /** Markdown. */
    description: text("description").notNull().default(""),
    kind: text("kind", { enum: TASK_KINDS }).notNull().default("media"),
    mediaAccept: text("media_accept", { enum: MEDIA_ACCEPT }).notNull().default("photo"),
    /** Accepted answers for `answer` tasks. Empty means a judge reviews every answer. */
    answers: text("answers", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    answerMatch: text("answer_match", { enum: ANSWER_MATCH }).notNull().default("loose"),
    /** Secret code printed on the checkpoint poster (QR encodes /h/[slug]/cp/[code]). */
    checkpointCode: text("checkpoint_code"),
    scoring: text("scoring", { enum: SCORING_MODES }).notNull().default("fixed"),
    /** Full value (fixed), starting value (rarity/race) or 1st place (contest). */
    points: integer("points").notNull().default(100),
    /** Floor for rarity/race, and the value of the last scoring place in a contest. */
    minPoints: integer("min_points").notNull().default(0),
    /** rarity/race: number of solves at which the value reaches `minPoints`. */
    decaySolves: integer("decay_solves").notNull().default(10),
    contestRank: text("contest_rank", { enum: CONTEST_RANKS }).notNull().default("highest"),
    contestPlaces: integer("contest_places").notNull().default(3),
    /** Unit label for contest values, e.g. "cm" or "people". */
    contestUnit: text("contest_unit"),
    /** Accept media/text proof without review. Judges can still reject later. */
    autoApprove: bool("auto_approve").notNull().default(false),
    /** Answer tasks: wrong attempts allowed before the task locks for the team. Null = unlimited. */
    maxAttempts: integer("max_attempts"),
    category: text("category"),
    /** Hidden from players until this time. */
    unlockAt: ts("unlock_at"),
    /** No new submissions after this time. */
    lockAt: ts("lock_at"),
    /** Hidden from players entirely (drafts, bonus tasks revealed later). */
    hidden: bool("hidden").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_hunt_idx").on(t.huntId, t.sortOrder),
    uniqueIndex("tasks_hunt_code_uq").on(t.huntId, t.code),
    uniqueIndex("tasks_hunt_checkpoint_uq").on(t.huntId, t.checkpointCode),
  ],
);

export const hints = sqliteTable(
  "hints",
  {
    id: id(),
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Points deducted from the team when revealed. */
    cost: integer("cost").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("hints_task_idx").on(t.taskId)],
);

export const hintUnlocks = sqliteTable(
  "hint_unlocks",
  {
    hintId: text("hint_id")
      .notNull()
      .references(() => hints.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    playerId: text("player_id").references(() => players.id, { onDelete: "set null" }),
    /** Cost at the time of reveal, so later edits don't rewrite history. */
    cost: integer("cost").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.hintId, t.teamId] }),
    index("hint_unlocks_hunt_idx").on(t.huntId),
    index("hint_unlocks_team_idx").on(t.teamId),
  ],
);

// ---------------------------------------------------------------------------
// Submissions & scoring
// ---------------------------------------------------------------------------

export const SUBMISSION_STATUSES = ["pending", "approved", "rejected"] as const;

export const submissions = sqliteTable(
  "submissions",
  {
    id: id(),
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: text("player_id").references(() => players.id, { onDelete: "set null" }),
    /** Idempotency key generated on the device, so offline retries never double-submit. */
    clientId: text("client_id"),
    /** Answer text, checkpoint code, or a note attached to media. */
    text: text("text"),
    status: text("status", { enum: SUBMISSION_STATUSES }).notNull().default("pending"),
    /** Judge-set award that replaces the computed value (partial credit or bonus). */
    pointsOverride: integer("points_override"),
    /** Contest tasks: the measured value the judge recorded (e.g. 184 cm). */
    contestValue: real("contest_value"),
    feedback: text("feedback"),
    judgedBy: text("judged_by").references(() => users.id, { onDelete: "set null" }),
    judgedAt: ts("judged_at"),
    /** True when the system decided (answer match, checkpoint, auto-approve). */
    autoJudged: bool("auto_judged").notNull().default(false),
    /** Soft lock so two judges don't review the same submission at once. */
    claimedBy: text("claimed_by").references(() => users.id, { onDelete: "set null" }),
    claimedAt: ts("claimed_at"),
    lat: real("lat"),
    lng: real("lng"),
    accuracy: real("accuracy"),
    /** When the team submitted. Scoring order and freeze cut-offs use this. */
    createdAt: createdAt(),
  },
  (t) => [
    index("submissions_queue_idx").on(t.huntId, t.status, t.createdAt),
    // The submissions list across every status, newest first.
    index("submissions_hunt_created_idx").on(t.huntId, t.createdAt),
    index("submissions_team_task_idx").on(t.teamId, t.taskId),
    index("submissions_task_idx").on(t.taskId, t.status),
    uniqueIndex("submissions_team_client_uq").on(t.teamId, t.clientId),
  ],
);

export const adjustments = sqliteTable(
  "adjustments",
  {
    id: id(),
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** Positive for a bonus, negative for a penalty. */
    points: integer("points").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("adjustments_hunt_idx").on(t.huntId), index("adjustments_team_idx").on(t.teamId)],
);

export const announcements = sqliteTable(
  "announcements",
  {
    id: id(),
    huntId: text("hunt_id")
      .notNull()
      .references(() => hunts.id, { onDelete: "cascade" }),
    title: text("title"),
    body: text("body").notNull(),
    pinned: bool("pinned").notNull().default(false),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("announcements_hunt_idx").on(t.huntId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Files, audit, push
// ---------------------------------------------------------------------------

export const FILE_OWNER_KINDS = ["submission", "task", "hunt"] as const;
export const FILE_KINDS = ["image", "video", "audio", "document"] as const;

export const files = sqliteTable(
  "files",
  {
    id: id(),
    huntId: text("hunt_id").references(() => hunts.id, { onDelete: "cascade" }),
    ownerKind: text("owner_kind", { enum: FILE_OWNER_KINDS }).notNull(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind", { enum: FILE_KINDS }).notNull(),
    mime: text("mime").notNull(),
    ext: text("ext").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalName: text("original_name"),
    /** Generated derivatives stored next to the original: "thumb", "display", "poster". */
    variants: text("variants", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("files_owner_idx").on(t.ownerKind, t.ownerId), index("files_hunt_idx").on(t.huntId)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    huntId: text("hunt_id").references(() => hunts.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Dotted verb, e.g. "submission.approve", "team.rename", "adjustment.create". */
    action: text("action").notNull(),
    targetKind: text("target_kind"),
    targetId: text("target_id"),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_hunt_idx").on(t.huntId, t.createdAt),
    // A submission's or team's history ("who changed this score?").
    index("audit_target_idx").on(t.huntId, t.targetKind, t.targetId),
  ],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: id(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    failures: integer("failures").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_endpoint_uq").on(t.endpoint), index("push_session_idx").on(t.sessionId)],
);

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Hunt = typeof hunts.$inferSelect;
export type HuntStaff = typeof huntStaff.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Hint = typeof hints.$inferSelect;
export type HintUnlock = typeof hintUnlocks.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Adjustment = typeof adjustments.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

export type HuntStatus = (typeof HUNT_STATUSES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type TaskKind = (typeof TASK_KINDS)[number];
export type ScoringMode = (typeof SCORING_MODES)[number];
export type ContestRank = (typeof CONTEST_RANKS)[number];
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type Accent = (typeof ACCENTS)[number];
