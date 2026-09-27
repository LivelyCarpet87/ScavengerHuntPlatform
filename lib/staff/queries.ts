import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adjustments,
  announcements,
  auditLog,
  files,
  type Hunt,
  hints,
  hintUnlocks,
  huntStaff,
  hunts,
  invites,
  players,
  pushSubscriptions,
  type StaffRole,
  submissions,
  tasks,
  teams,
  type User,
  users,
} from "@/lib/db/schema";

/*
 * Read models for the organizer pages. Every query is scoped by hunt id.
 */

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type DashboardHunt = {
  hunt: Hunt;
  role: StaffRole;
  taskCount: number;
  teamCount: number;
  playerCount: number;
  pendingCount: number;
};

function countMap(rows: { huntId: string; n: number }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.huntId, r.n]));
}

/** Hunts the user staffs (or every hunt, for platform admins asking for "all"). */
export async function listDashboardHunts(user: User, scope: "mine" | "all"): Promise<DashboardHunt[]> {
  let rows: { hunt: Hunt; role: StaffRole }[];
  if (scope === "all" && user.isAdmin) {
    rows = (await db.select().from(hunts).orderBy(desc(hunts.updatedAt))).map((hunt) => ({
      hunt,
      role: "owner" as const,
    }));
  } else {
    rows = await db
      .select({ hunt: hunts, role: huntStaff.role })
      .from(huntStaff)
      .innerJoin(hunts, eq(hunts.id, huntStaff.huntId))
      .where(eq(huntStaff.userId, user.id))
      .orderBy(desc(hunts.updatedAt));
    // Platform admins act as owner everywhere.
    if (user.isAdmin) rows = rows.map((r) => ({ ...r, role: "owner" as const }));
  }
  const ids = rows.map((r) => r.hunt.id);
  if (ids.length === 0) return [];

  const [taskRows, teamRows, playerRows, pendingRows] = await Promise.all([
    db.select({ huntId: tasks.huntId, n: count() }).from(tasks).where(inArray(tasks.huntId, ids)).groupBy(tasks.huntId),
    db
      .select({ huntId: teams.huntId, n: count() })
      .from(teams)
      .where(and(inArray(teams.huntId, ids), eq(teams.hidden, false)))
      .groupBy(teams.huntId),
    db
      .select({ huntId: players.huntId, n: count() })
      .from(players)
      .innerJoin(teams, eq(teams.id, players.teamId))
      .where(and(inArray(players.huntId, ids), eq(teams.hidden, false)))
      .groupBy(players.huntId),
    db
      .select({ huntId: submissions.huntId, n: count() })
      .from(submissions)
      .where(and(inArray(submissions.huntId, ids), eq(submissions.status, "pending")))
      .groupBy(submissions.huntId),
  ]);
  const t = countMap(taskRows);
  const tm = countMap(teamRows);
  const p = countMap(playerRows);
  const pe = countMap(pendingRows);
  return rows.map(({ hunt, role }) => ({
    hunt,
    role,
    taskCount: t.get(hunt.id) ?? 0,
    teamCount: tm.get(hunt.id) ?? 0,
    playerCount: p.get(hunt.id) ?? 0,
    pendingCount: pe.get(hunt.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type HuntStats = {
  teams: number;
  hiddenTeams: number;
  players: number;
  tasks: number;
  checkpoints: number;
  pending: number;
  approved: number;
  rejected: number;
};

export async function getHuntStats(huntId: string): Promise<HuntStats> {
  const [teamRows, playerRow, taskRows, subRows] = await Promise.all([
    db.select({ hidden: teams.hidden, n: count() }).from(teams).where(eq(teams.huntId, huntId)).groupBy(teams.hidden),
    db
      .select({ n: count() })
      .from(players)
      .innerJoin(teams, eq(teams.id, players.teamId))
      .where(and(eq(players.huntId, huntId), eq(teams.hidden, false)))
      .get(),
    db.select({ kind: tasks.kind, n: count() }).from(tasks).where(eq(tasks.huntId, huntId)).groupBy(tasks.kind),
    db
      .select({ status: submissions.status, n: count() })
      .from(submissions)
      .where(eq(submissions.huntId, huntId))
      .groupBy(submissions.status),
  ]);
  const byStatus = new Map(subRows.map((r) => [r.status, r.n]));
  return {
    teams: teamRows.find((r) => !r.hidden)?.n ?? 0,
    hiddenTeams: teamRows.find((r) => r.hidden)?.n ?? 0,
    players: playerRow?.n ?? 0,
    tasks: taskRows.reduce((sum, r) => sum + r.n, 0),
    checkpoints: taskRows.find((r) => r.kind === "checkpoint")?.n ?? 0,
    pending: byStatus.get("pending") ?? 0,
    approved: byStatus.get("approved") ?? 0,
    rejected: byStatus.get("rejected") ?? 0,
  };
}

export type ActivityItem = {
  id: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  autoJudged: boolean;
  team: { id: string; name: string; emoji: string; color: string };
  task: { id: string; title: string; code: number };
};

/** The latest submissions, newest first. */
export async function recentActivity(huntId: string, limit = 10): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      id: submissions.id,
      status: submissions.status,
      createdAt: submissions.createdAt,
      autoJudged: submissions.autoJudged,
      teamId: teams.id,
      teamName: teams.name,
      teamEmoji: teams.emoji,
      teamColor: teams.color,
      taskId: tasks.id,
      taskTitle: tasks.title,
      taskCode: tasks.code,
    })
    .from(submissions)
    .innerJoin(teams, eq(teams.id, submissions.teamId))
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .where(eq(submissions.huntId, huntId))
    .orderBy(desc(submissions.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    autoJudged: r.autoJudged,
    team: { id: r.teamId, name: r.teamName, emoji: r.teamEmoji, color: r.teamColor },
    task: { id: r.taskId, title: r.taskTitle, code: r.taskCode },
  }));
}

export async function staffCount(huntId: string): Promise<number> {
  const row = await db.select({ n: count() }).from(huntStaff).where(eq(huntStaff.huntId, huntId)).get();
  return row?.n ?? 0;
}

function activeInviteFilter(huntId: string, now: Date) {
  return and(
    eq(invites.huntId, huntId),
    isNull(invites.revokedAt),
    or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
    or(isNull(invites.maxUses), lt(invites.uses, invites.maxUses)),
  );
}

export async function activeInviteCount(huntId: string, now = new Date()): Promise<number> {
  const row = await db.select({ n: count() }).from(invites).where(activeInviteFilter(huntId, now)).get();
  return row?.n ?? 0;
}

/**
 * The data recorded with a staff action, e.g. the name of a hunt, task or team
 * that was just deleted. Pages use it for "Deleted …" notices, so the text
 * comes from the record rather than from the URL. `huntId` null means a
 * platform-level entry (a deleted hunt's own rows are gone with it).
 */
export async function auditData(
  huntId: string | null,
  action: string,
  targetId: string,
  actorUserId?: string,
): Promise<Record<string, unknown> | null> {
  if (!targetId || targetId.length > 64) return null;
  const row = await db
    .select({ data: auditLog.data })
    .from(auditLog)
    .where(
      and(
        huntId ? eq(auditLog.huntId, huntId) : isNull(auditLog.huntId),
        eq(auditLog.action, action),
        eq(auditLog.targetId, targetId),
        actorUserId ? eq(auditLog.actorUserId, actorUserId) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1)
    .get();
  return row?.data ?? null;
}

/** Whether anyone has printed the hunt's checkpoint posters (recorded by the print page). */
export async function hasPrinted(huntId: string, what: "checkpoints" | "poster" | "team_cards"): Promise<boolean> {
  const row = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.huntId, huntId), eq(auditLog.action, `print.${what}`)))
    .limit(1)
    .get();
  return !!row;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks(huntId: string) {
  return db.select().from(tasks).where(eq(tasks.huntId, huntId)).orderBy(asc(tasks.sortOrder), asc(tasks.code));
}

export async function hintCounts(huntId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ taskId: hints.taskId, n: count() })
    .from(hints)
    .where(eq(hints.huntId, huntId))
    .groupBy(hints.taskId);
  return new Map(rows.map((r) => [r.taskId, r.n]));
}

export async function taskCategories(huntId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: tasks.category })
    .from(tasks)
    .where(and(eq(tasks.huntId, huntId), isNotNull(tasks.category)));
  return rows
    .map((r) => r.category)
    .filter((c): c is string => !!c)
    .sort((a, b) => a.localeCompare(b));
}

export async function getTask(huntId: string, taskId: string) {
  return (
    (await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.huntId, huntId)))
      .get()) ?? null
  );
}

export async function listHints(huntId: string, taskId: string) {
  return db
    .select()
    .from(hints)
    .where(and(eq(hints.huntId, huntId), eq(hints.taskId, taskId)))
    .orderBy(asc(hints.sortOrder), asc(hints.createdAt));
}

export async function listTaskFiles(huntId: string, taskId: string) {
  return db
    .select()
    .from(files)
    .where(and(eq(files.huntId, huntId), eq(files.ownerKind, "task"), eq(files.ownerId, taskId)))
    .orderBy(asc(files.sortOrder), asc(files.createdAt));
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function listTeams(huntId: string) {
  return db.select().from(teams).where(eq(teams.huntId, huntId)).orderBy(asc(teams.name));
}

export async function memberCounts(huntId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ teamId: players.teamId, n: count() })
    .from(players)
    .where(eq(players.huntId, huntId))
    .groupBy(players.teamId);
  return new Map(rows.map((r) => [r.teamId, r.n]));
}

export async function submissionCountsByTeam(huntId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ teamId: submissions.teamId, n: count() })
    .from(submissions)
    .where(eq(submissions.huntId, huntId))
    .groupBy(submissions.teamId);
  return new Map(rows.map((r) => [r.teamId, r.n]));
}

export async function getTeam(huntId: string, teamId: string) {
  return (
    (await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.huntId, huntId)))
      .get()) ?? null
  );
}

export async function teamMembers(huntId: string, teamId: string) {
  return db
    .select()
    .from(players)
    .where(and(eq(players.huntId, huntId), eq(players.teamId, teamId)))
    .orderBy(desc(players.isCaptain), asc(players.createdAt));
}

export async function teamSubmissions(huntId: string, teamId: string) {
  return db
    .select({
      id: submissions.id,
      status: submissions.status,
      createdAt: submissions.createdAt,
      autoJudged: submissions.autoJudged,
      pointsOverride: submissions.pointsOverride,
      contestValue: submissions.contestValue,
      text: submissions.text,
      taskId: tasks.id,
      taskTitle: tasks.title,
      taskCode: tasks.code,
      taskKind: tasks.kind,
      contestUnit: tasks.contestUnit,
      playerName: players.name,
    })
    .from(submissions)
    .innerJoin(tasks, eq(tasks.id, submissions.taskId))
    .leftJoin(players, eq(players.id, submissions.playerId))
    .where(and(eq(submissions.huntId, huntId), eq(submissions.teamId, teamId)))
    .orderBy(desc(submissions.createdAt));
}

export async function teamAdjustments(huntId: string, teamId: string) {
  return db
    .select({
      id: adjustments.id,
      points: adjustments.points,
      reason: adjustments.reason,
      createdAt: adjustments.createdAt,
      byName: users.name,
    })
    .from(adjustments)
    .leftJoin(users, eq(users.id, adjustments.createdBy))
    .where(and(eq(adjustments.huntId, huntId), eq(adjustments.teamId, teamId)))
    .orderBy(desc(adjustments.createdAt));
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function listAnnouncements(huntId: string) {
  return db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      pinned: announcements.pinned,
      createdAt: announcements.createdAt,
      byName: users.name,
    })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.createdBy))
    .where(eq(announcements.huntId, huntId))
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt));
}

/** How many player devices in the hunt have push notifications on. */
export async function pushReach(huntId: string): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(pushSubscriptions)
    .innerJoin(players, eq(players.sessionId, pushSubscriptions.sessionId))
    .where(eq(players.huntId, huntId))
    .get();
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function listStaff(huntId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: huntStaff.role,
      createdAt: huntStaff.createdAt,
    })
    .from(huntStaff)
    .innerJoin(users, eq(users.id, huntStaff.userId))
    .where(eq(huntStaff.huntId, huntId))
    .orderBy(asc(huntStaff.createdAt));
}

export async function listActiveInvites(huntId: string, now = new Date()) {
  return db
    .select({
      id: invites.id,
      role: invites.role,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
      maxUses: invites.maxUses,
      uses: invites.uses,
      byName: users.name,
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(activeInviteFilter(huntId, now))
    .orderBy(desc(invites.createdAt));
}

export async function getFile(huntId: string, fileId: string | null) {
  if (!fileId) return null;
  return (
    (await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.huntId, huntId)))
      .get()) ?? null
  );
}

export async function taskSubmissionCount(huntId: string, taskId: string): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(submissions)
    .where(and(eq(submissions.huntId, huntId), eq(submissions.taskId, taskId)))
    .get();
  return row?.n ?? 0;
}

/** How many teams revealed each hint. */
export async function hintRevealCounts(huntId: string, hintIds: string[]): Promise<Map<string, number>> {
  if (hintIds.length === 0) return new Map();
  const rows = await db
    .select({ hintId: hintUnlocks.hintId, n: count() })
    .from(hintUnlocks)
    .where(and(eq(hintUnlocks.huntId, huntId), inArray(hintUnlocks.hintId, hintIds)))
    .groupBy(hintUnlocks.hintId);
  return new Map(rows.map((r) => [r.hintId, r.n]));
}
