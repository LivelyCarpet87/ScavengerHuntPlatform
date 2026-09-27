import "server-only";
import { and, asc, count, desc, eq, isNotNull, ne } from "drizzle-orm";
import { getStaffRole } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  type Announcement,
  announcements,
  type FileRow,
  files,
  type Hunt,
  hunts,
  type Player,
  players,
  type Submission,
  submissions,
  type Task,
  type Team,
  tasks,
  teams,
} from "@/lib/db/schema";
import {
  canViewScoreboard,
  getHuntByJoinCode,
  type HuntPhase,
  huntPhase,
  isTaskVisible,
  scoreboardCutoff,
} from "@/lib/hunts";
import { pickRandom, TEAM_COLOR_KEYS, TEAM_EMOJI, type TeamColor } from "@/lib/palette";
import { clientIp, peekRateLimit, rateLimit } from "@/lib/rate-limit";
import { getStandings, rankedCount, standingFor } from "@/lib/scoring/service";
import { teamNameCandidates, teamNameKey } from "./join";

/*
 * Reads for the player pages: the landing page's "Your hunts", the join and
 * invite pages, the hunt home, the team page and the updates feed. Every
 * query is scoped by hunt or team.
 */

// ---------------------------------------------------------------------------
// Code guessing
// ---------------------------------------------------------------------------

/**
 * Wrong codes one network may try per minute. Hunt codes are six digits;
 * team codes six characters from an alphabet of 31, so guessing either stays
 * hopeless at these rates.
 */
const CODE_MISSES_PER_MINUTE = { hunt: 30, team: 60 } as const;

export type CodeGuard = {
  /** Seconds until this network may try another code; 0 when it may try now. */
  retryAfterSec: number;
  /** Records a code that matched nothing. */
  miss: () => void;
};

/**
 * Brute-force protection for the codes people type, paste or scan. Only
 * wrong codes count: a crowd on one venue Wi-Fi (or behind one mobile
 * carrier address) scanning the same poster or joining their teams at the
 * start never trips it. Check `retryAfterSec` before looking a code up —
 * a blocked network learns nothing, not even about right codes — and call
 * `miss()` when the code matched nothing.
 */
export async function codeGuard(kind: keyof typeof CODE_MISSES_PER_MINUTE): Promise<CodeGuard> {
  const key = `${kind}-code-miss:${await clientIp()}`;
  const limit = CODE_MISSES_PER_MINUTE[kind];
  const peek = peekRateLimit(key, limit);
  return {
    retryAfterSec: peek.ok ? 0 : Math.max(1, peek.retryAfterSec),
    miss: () => {
      rateLimit(key, limit, 60_000);
    },
  };
}

// ---------------------------------------------------------------------------
// Finding hunts
// ---------------------------------------------------------------------------

/**
 * The hunt a 6-digit join code opens: published hunts for everyone, drafts
 * for their staff. Archived hunts no longer resolve.
 */
export async function findHuntForCode(code: string): Promise<Hunt | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const hunt = await getHuntByJoinCode(code);
  if (!hunt || hunt.status === "archived") return null;
  if (hunt.status === "draft" && !(await getStaffRole(hunt.id))) return null;
  return hunt;
}

export type DeviceHunt = {
  hunt: Pick<Hunt, "id" | "slug" | "name" | "accent" | "status" | "startsAt" | "endsAt" | "timezone">;
  team: Pick<Team, "id" | "name" | "emoji" | "color">;
  playerName: string;
  phase: HuntPhase;
  /** Rank and points when the hunt has started; rank is null when the scoreboard is hidden from players. */
  standing: { rank: number | null; total: number; teams: number; tied: boolean } | null;
};

const PHASE_ORDER: Record<HuntPhase, number> = { live: 0, upcoming: 1, ended: 2, draft: 3, archived: 4 };

/** Hunts this device has joined as a player, live ones first. */
export async function getDeviceHunts(now = new Date()): Promise<DeviceHunt[]> {
  const s = await getSession();
  if (!s) return [];
  const rows = await db
    .select({ player: players, team: teams, hunt: hunts })
    .from(players)
    .innerJoin(teams, eq(teams.id, players.teamId))
    .innerJoin(hunts, eq(hunts.id, players.huntId))
    .where(and(eq(players.sessionId, s.session.id), ne(hunts.status, "archived")));

  const out = await Promise.all(
    rows.map(async ({ player, team, hunt }): Promise<DeviceHunt | null> => {
      const staffRole = await getStaffRole(hunt.id);
      if (hunt.status === "draft" && !staffRole) return null;
      const phase = huntPhase(hunt, now);
      let standing: DeviceHunt["standing"] = null;
      if (phase === "live" || phase === "ended") {
        const viewer = { isStaff: !!staffRole, isPlayer: true };
        const standings = await getStandings(hunt.id, { cutoff: scoreboardCutoff(hunt, viewer, now) });
        const mine = standingFor(standings, team.id);
        if (mine) {
          const visible = canViewScoreboard(hunt, viewer) && mine.rank != null;
          standing = {
            rank: visible ? mine.rank : null,
            total: mine.total,
            teams: rankedCount(standings),
            tied: visible && standings.standings.some((o) => o.teamId !== mine.teamId && o.rank === mine.rank),
          };
        }
      }
      return {
        hunt: {
          id: hunt.id,
          slug: hunt.slug,
          name: hunt.name,
          accent: hunt.accent,
          status: hunt.status,
          startsAt: hunt.startsAt,
          endsAt: hunt.endsAt,
          timezone: hunt.timezone,
        },
        team: { id: team.id, name: team.name, emoji: team.emoji, color: team.color },
        playerName: player.name,
        phase,
        standing,
      };
    }),
  );

  return out
    .filter((d): d is DeviceHunt => d != null)
    .sort((a, b) => {
      const byPhase = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
      if (byPhase !== 0) return byPhase;
      if (a.phase === "live") return (a.hunt.endsAt?.getTime() ?? 0) - (b.hunt.endsAt?.getTime() ?? 0);
      if (a.phase === "upcoming") return (a.hunt.startsAt?.getTime() ?? 0) - (b.hunt.startsAt?.getTime() ?? 0);
      return (b.hunt.endsAt?.getTime() ?? 0) - (a.hunt.endsAt?.getTime() ?? 0);
    });
}

/** The hunt's cover image, if it has one. */
export async function getHuntCover(hunt: Pick<Hunt, "id" | "coverFileId">): Promise<FileRow | null> {
  if (!hunt.coverFileId) return null;
  const row = await db
    .select()
    .from(files)
    .where(and(eq(files.id, hunt.coverFileId), eq(files.huntId, hunt.id)))
    .get();
  return row?.kind === "image" ? row : null;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type HuntTasks = {
  /** Tasks players can see now, in the organizer's order. */
  visible: Task[];
  /** Tasks that unlock later (not hidden): how many, and the next unlock time. */
  later: { count: number; nextAt: Date | null };
  /** Every task that isn't hidden, including those that unlock later. */
  listed: number;
};

export async function getHuntTasks(huntId: string, now = new Date()): Promise<HuntTasks> {
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.huntId, huntId))
    .orderBy(asc(tasks.sortOrder), asc(tasks.code));
  const visible = rows.filter((t) => isTaskVisible(t, now));
  const later = rows.filter((t) => !t.hidden && t.unlockAt && t.unlockAt > now);
  const nextAt = later.reduce<Date | null>(
    (min, t) => (t.unlockAt && (!min || t.unlockAt < min) ? t.unlockAt : min),
    null,
  );
  return { visible, later: { count: later.length, nextAt }, listed: rows.filter((t) => !t.hidden).length };
}

/** Number of tasks that aren't hidden — the "controls" count on the hunt's legend. */
export async function countListedTasks(huntId: string): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.huntId, huntId), eq(tasks.hidden, false)))
    .get();
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/** Members of a team: the captain first, then in the order they joined. */
export async function getTeamMembers(teamId: string): Promise<Player[]> {
  return db
    .select()
    .from(players)
    .where(eq(players.teamId, teamId))
    .orderBy(desc(players.isCaptain), asc(players.createdAt), asc(players.id));
}

export async function getTeamByCode(huntId: string, code: string): Promise<Team | null> {
  if (!/^[A-Z0-9]{6}$/.test(code)) return null;
  return (
    (await db
      .select()
      .from(teams)
      .where(and(eq(teams.huntId, huntId), eq(teams.code, code)))
      .get()) ?? null
  );
}

export async function isTeamNameTaken(huntId: string, name: string, exceptTeamId?: string): Promise<boolean> {
  const row = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.huntId, huntId), eq(teams.nameKey, teamNameKey(name))))
    .get();
  return !!row && row.id !== exceptTeamId;
}

/** A free variation of a taken team name, e.g. "Night Owls 2". */
export async function suggestTeamName(huntId: string, name: string): Promise<string | null> {
  const rows = await db.select({ key: teams.nameKey }).from(teams).where(eq(teams.huntId, huntId));
  const taken = new Set(rows.map((r) => r.key));
  return teamNameCandidates(name).find((c) => !taken.has(teamNameKey(c))) ?? null;
}

/**
 * A starting look for a new team: an emoji nobody in the hunt uses yet and
 * one of the least-used colors, so teams tell apart at a glance.
 */
export async function pickTeamLook(huntId: string): Promise<{ emoji: string; color: TeamColor }> {
  const rows = await db.select({ emoji: teams.emoji, color: teams.color }).from(teams).where(eq(teams.huntId, huntId));
  const usedEmoji = new Set(rows.map((r) => r.emoji));
  const freeEmoji = TEAM_EMOJI.filter((e) => !usedEmoji.has(e));
  const uses = new Map<string, number>(TEAM_COLOR_KEYS.map((c) => [c, 0]));
  for (const r of rows) uses.set(r.color, (uses.get(r.color) ?? 0) + 1);
  const fewest = Math.min(...uses.values());
  const colors = TEAM_COLOR_KEYS.filter((c) => uses.get(c) === fewest);
  return { emoji: pickRandom(freeEmoji.length > 0 ? freeEmoji : TEAM_EMOJI), color: pickRandom(colors) };
}

// ---------------------------------------------------------------------------
// Announcements and results
// ---------------------------------------------------------------------------

export async function getPinnedAnnouncements(huntId: string, limit = 2): Promise<Announcement[]> {
  return db
    .select()
    .from(announcements)
    .where(and(eq(announcements.huntId, huntId), eq(announcements.pinned, true)))
    .orderBy(desc(announcements.createdAt))
    .limit(limit);
}

export type JudgedResult = Pick<
  Submission,
  "id" | "taskId" | "status" | "feedback" | "pointsOverride" | "contestValue" | "createdAt"
> & {
  judgedAt: Date;
  task: Pick<Task, "id" | "code" | "title" | "kind" | "contestUnit" | "hidden" | "unlockAt" | "lockAt" | "maxAttempts">;
};

/**
 * What a player's Updates tab lists: every announcement, and the team's
 * submissions a judge decided on (instant results, like a correct answer,
 * aren't news). Newest first.
 */
export async function getUpdatesFeed(
  huntId: string,
  teamId: string,
): Promise<{ announcements: Announcement[]; results: JudgedResult[] }> {
  const [ann, results] = await Promise.all([
    db
      .select()
      .from(announcements)
      .where(eq(announcements.huntId, huntId))
      .orderBy(desc(announcements.createdAt))
      .limit(200),
    db
      .select({
        id: submissions.id,
        taskId: submissions.taskId,
        status: submissions.status,
        feedback: submissions.feedback,
        pointsOverride: submissions.pointsOverride,
        contestValue: submissions.contestValue,
        createdAt: submissions.createdAt,
        judgedAt: submissions.judgedAt,
        task: {
          id: tasks.id,
          code: tasks.code,
          title: tasks.title,
          kind: tasks.kind,
          contestUnit: tasks.contestUnit,
          hidden: tasks.hidden,
          unlockAt: tasks.unlockAt,
          lockAt: tasks.lockAt,
          maxAttempts: tasks.maxAttempts,
        },
      })
      .from(submissions)
      .innerJoin(tasks, eq(tasks.id, submissions.taskId))
      .where(
        and(
          eq(submissions.huntId, huntId),
          eq(submissions.teamId, teamId),
          ne(submissions.status, "pending"),
          eq(submissions.autoJudged, false),
          isNotNull(submissions.judgedAt),
        ),
      )
      .orderBy(desc(submissions.judgedAt))
      .limit(200),
  ]);
  return {
    announcements: ann,
    results: results.map((r) => ({ ...r, judgedAt: r.judgedAt as Date })),
  };
}
