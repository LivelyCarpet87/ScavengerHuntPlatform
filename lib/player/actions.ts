"use server";

import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm } from "@/lib/actions";
import { getPlayer, getStaffRole, type PlayerContext } from "@/lib/auth/access";
import { ensureSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { type Hunt, type Player, players, type Team, teams } from "@/lib/db/schema";
import { getHuntById, huntPhase } from "@/lib/hunts";
import { newCode } from "@/lib/ids";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/realtime/bus";
import {
  extractHuntCode,
  joinPolicy,
  safeNextPath,
  teamNameKey,
  zPlayerName,
  zTeamCode,
  zTeamColor,
  zTeamEmoji,
  zTeamName,
} from "./join";
import { codeGuard, findHuntForCode, getTeamByCode, isTeamNameTaken, suggestTeamName } from "./queries";

/*
 * Player Server Actions: finding a hunt, starting and joining teams, and
 * managing your team. Actions are public endpoints, so every rule is checked
 * here again — hidden form fields only say which hunt/team/player is meant.
 */

// Messages -------------------------------------------------------------------

const NO_HUNT = "No hunt uses that code. Check the six digits on the poster.";
const WRONG_HUNT_CODE = "That code doesn’t match this hunt. Check the six digits on the poster.";
const NEED_HUNT_CODE = "Enter the six-digit hunt code from the poster.";
const NO_TEAM = "No team in this hunt uses that code. Check it with your teammates.";
const HUNT_GONE = "This hunt isn’t available any more.";
const NOT_JOINED = "You’re not on a team in this hunt on this device.";
const TEAM_FINAL = "The hunt is over, so teams can’t change any more.";

function seconds(n: number) {
  return n === 1 ? "1 second" : `${n} seconds`;
}

/** Too many wrong codes (see codeGuard). */
function tooManyCodes(retryAfterSec: number) {
  return `Too many wrong codes were tried from this network. Wait ${seconds(retryAfterSec)}, then try again.`;
}

/** The per-network cap on creating or joining teams (spam protection). */
function tooMany(retryAfterSec: number) {
  return `Too many tries from this network. Wait ${seconds(retryAfterSec)}, then try again.`;
}

// Helpers ---------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const zId = z.string().min(1).max(64);

/** The hunt a form refers to, as long as this viewer may see it (drafts: staff only). */
async function loadHunt(huntId: string): Promise<Hunt | null> {
  const hunt = await getHuntById(huntId);
  if (!hunt) return null;
  if (hunt.status === "draft" && !(await getStaffRole(hunt.id))) return null;
  return hunt;
}

function isOver(hunt: Hunt): boolean {
  const phase = huntPhase(hunt);
  return phase === "ended" || phase === "archived";
}

/** Which unique index an insert/update ran into, if any (drizzle wraps the libSQL error). */
function uniqueViolation(err: unknown): "team-code" | "team-name" | "player" | "other" | null {
  let e: unknown = err;
  for (let depth = 0; depth < 5 && e; depth++) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("UNIQUE constraint failed")) {
      if (message.includes("teams.code")) return "team-code";
      if (message.includes("teams.name_key")) return "team-name";
      if (message.includes("players.session_id")) return "player";
      return "other";
    }
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

async function nameTakenState(huntId: string, name: string): Promise<ActionState<never>> {
  const suggestion = await suggestTeamName(huntId, name);
  const message = suggestion
    ? `“${name}” is already taken in this hunt. How about “${suggestion}”?`
    : `“${name}” is already taken in this hunt. Try another name.`;
  return fail(message, suggestion ? { name: message, nameSuggestion: suggestion } : { name: message });
}

/** When a captain leaves, the longest-standing member with a signed-in device takes over. */
async function handOffCaptaincy(tx: Tx, leaving: Pick<Player, "id" | "teamId" | "isCaptain">) {
  if (!leaving.isCaptain) return;
  const next = await tx
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.teamId, leaving.teamId), ne(players.id, leaving.id)))
    .orderBy(asc(sql`(${players.sessionId} is null)`), asc(players.createdAt))
    .limit(1)
    .get();
  if (next) await tx.update(players).set({ isCaptain: true }).where(eq(players.id, next.id));
}

class TeamFullError extends Error {}
class AlreadyClaimedError extends Error {}

function refreshHunt(hunt: Pick<Hunt, "slug">) {
  revalidatePath(`/h/${hunt.slug}`, "layout");
}

// Finding a hunt ---------------------------------------------------------------

/** Landing page: turn a typed/pasted/scanned hunt code into the hunt's page. */
export async function findHuntByCode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const code = extractHuntCode(String(formData.get("code") ?? ""));
  if (!code) return fail("Enter all six digits of the hunt code.");
  const guard = await codeGuard("hunt");
  if (guard.retryAfterSec) return fail(tooManyCodes(guard.retryAfterSec));
  const hunt = await findHuntForCode(code);
  if (!hunt) {
    guard.miss();
    return fail(NO_HUNT);
  }
  redirect(`/h/${hunt.slug}?code=${code}`);
}

// Starting and joining teams -------------------------------------------------------

const CreateTeamSchema = z.object({
  huntId: zId,
  name: zTeamName,
  emoji: zTeamEmoji,
  color: zTeamColor,
  playerName: zPlayerName,
  huntCode: z.string().max(200).optional(),
  next: z.string().max(300).optional(),
});

export async function createTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(CreateTeamSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { huntId, name, emoji, color, playerName, huntCode, next } = parsed.data;

  const hunt = await loadHunt(huntId);
  if (!hunt) return fail(HUNT_GONE);
  const policy = joinPolicy(hunt, huntPhase(hunt));
  if (policy.closed) return fail(policy.closed);
  if (!policy.canCreateTeam) return fail(policy.createNote ?? "You can’t start a team in this hunt.");

  const limit = rateLimit(`team-create:${await clientIp()}`, 60, 60_000);
  if (!limit.ok) return fail(tooMany(limit.retryAfterSec));
  if (policy.needsHuntCode) {
    const typed = extractHuntCode(huntCode ?? "");
    if (!typed) return fail(NEED_HUNT_CODE, { huntCode: NEED_HUNT_CODE });
    const guard = await codeGuard("hunt");
    if (guard.retryAfterSec) return fail(tooManyCodes(guard.retryAfterSec));
    if (typed !== hunt.joinCode) {
      guard.miss();
      return fail(WRONG_HUNT_CODE, { huntCode: WRONG_HUNT_CODE });
    }
  }

  const current = await getPlayer(hunt.id);
  if (current) {
    return fail(`You’re already on ${current.team.name} on this device. Leave that team first to start a new one.`);
  }
  if (await isTeamNameTaken(hunt.id, name)) return nameTakenState(hunt.id, name);

  const session = await ensureSession();
  let team: Team | null = null;
  for (let attempt = 0; attempt < 6 && !team; attempt++) {
    try {
      team = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(teams)
          .values({
            huntId: hunt.id,
            name,
            nameKey: teamNameKey(name),
            emoji,
            color,
            code: newCode(),
            origin: "player",
          })
          .returning();
        await tx
          .insert(players)
          .values({ huntId: hunt.id, teamId: created.id, sessionId: session.id, name: playerName, isCaptain: true });
        return created;
      });
    } catch (err) {
      const which = uniqueViolation(err);
      if (which === "team-code") continue; // another team drew the same code — draw again
      if (which === "team-name") return nameTakenState(hunt.id, name);
      if (which === "player") return fail("This device already joined a team in this hunt. Reload the page.");
      throw err;
    }
  }
  if (!team) return fail("Couldn’t create the team just now. Try again.");

  publish(hunt.id, { type: "teams.changed", teamId: team.id });
  refreshHunt(hunt);
  redirect(safeNextPath(next, hunt.slug) ?? `/h/${hunt.slug}?welcome=1`);
}

export type JoinTeamState = ActionState<{ confirmMove: { from: string; to: string } }>;

const JoinTeamSchema = z.object({
  huntId: zId,
  teamCode: zTeamCode,
  playerName: zPlayerName,
  next: z.string().max(300).optional(),
  /** "1" once the player confirmed leaving their current team for this one. */
  confirmMove: z.string().max(4).optional(),
});

export async function joinTeam(_prev: JoinTeamState, formData: FormData): Promise<JoinTeamState> {
  const parsed = parseForm(JoinTeamSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { huntId, teamCode, playerName, next, confirmMove } = parsed.data;

  const hunt = await loadHunt(huntId);
  if (!hunt) return fail(HUNT_GONE);
  const policy = joinPolicy(hunt, huntPhase(hunt));
  if (policy.closed) return fail(policy.closed);

  const limit = rateLimit(`team-join:${await clientIp()}`, 120, 60_000);
  if (!limit.ok) return fail(tooMany(limit.retryAfterSec));
  const guard = await codeGuard("team");
  if (guard.retryAfterSec) return fail(tooManyCodes(guard.retryAfterSec));
  const team = await getTeamByCode(hunt.id, teamCode);
  if (!team) {
    guard.miss();
    return fail(NO_TEAM, { teamCode: NO_TEAM });
  }

  const home = `/h/${hunt.slug}`;
  const destination = safeNextPath(next, hunt.slug);
  const current = await getPlayer(hunt.id);
  if (current?.team.id === team.id) redirect(destination ?? home);
  if (current && confirmMove !== "1") {
    return ok(undefined, { confirmMove: { from: current.team.name, to: team.name } });
  }

  const session = await ensureSession();
  try {
    await db.transaction(async (tx) => {
      const members = await tx.select({ n: count() }).from(players).where(eq(players.teamId, team.id)).get();
      if (hunt.maxTeamSize && (members?.n ?? 0) >= hunt.maxTeamSize) throw new TeamFullError();
      const captain = await tx
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.teamId, team.id), eq(players.isCaptain, true)))
        .get();
      if (current) {
        await handOffCaptaincy(tx, current.player);
        await tx
          .update(players)
          .set({ teamId: team.id, name: playerName, isCaptain: !captain, seenUpdatesAt: new Date() })
          .where(eq(players.id, current.player.id));
      } else {
        await tx
          .insert(players)
          .values({ huntId: hunt.id, teamId: team.id, sessionId: session.id, name: playerName, isCaptain: !captain });
      }
    });
  } catch (err) {
    if (err instanceof TeamFullError) {
      return fail(
        `${team.name} is full. Teams in this hunt have up to ${hunt.maxTeamSize} players, so ask the captain to make room or start your own team.`,
      );
    }
    if (uniqueViolation(err) === "player")
      return fail("This device already joined a team in this hunt. Reload the page.");
    throw err;
  }

  publish(hunt.id, { type: "teams.changed", teamId: team.id });
  if (current) publish(hunt.id, { type: "teams.changed", teamId: current.team.id });
  refreshHunt(hunt);
  redirect(destination ?? `${home}?welcome=1`);
}

const ReclaimSchema = z.object({
  huntId: zId,
  teamCode: zTeamCode,
  playerId: zId,
  next: z.string().max(300).optional(),
  confirmMove: z.string().max(4).optional(),
});

/** "I'm already on this team": puts a member whose device was lost back on this device. */
export async function reclaimPlayer(_prev: JoinTeamState, formData: FormData): Promise<JoinTeamState> {
  const parsed = parseForm(ReclaimSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { huntId, teamCode, playerId, next, confirmMove } = parsed.data;

  const hunt = await loadHunt(huntId);
  if (!hunt) return fail(HUNT_GONE);
  const policy = joinPolicy(hunt, huntPhase(hunt));
  if (policy.closed) return fail(policy.closed);

  const limit = rateLimit(`team-join:${await clientIp()}`, 120, 60_000);
  if (!limit.ok) return fail(tooMany(limit.retryAfterSec));
  const guard = await codeGuard("team");
  if (guard.retryAfterSec) return fail(tooManyCodes(guard.retryAfterSec));
  const team = await getTeamByCode(hunt.id, teamCode);
  if (!team) {
    guard.miss();
    return fail(NO_TEAM);
  }

  const target = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.teamId, team.id), eq(players.huntId, hunt.id)))
    .get();
  if (!target) return fail("That name isn’t on this team any more. Join with your name instead.");
  if (target.sessionId) {
    return fail(
      `${target.name} is still signed in on another device. If that’s you, ask your captain to sign that device out on the Team tab, then pick your name again.`,
    );
  }

  const home = `/h/${hunt.slug}`;
  const current = await getPlayer(hunt.id);
  if (current?.team.id === team.id) {
    return fail(`This device is already on ${team.name} as ${current.player.name}.`);
  }
  if (current && confirmMove !== "1") {
    return ok(undefined, { confirmMove: { from: current.team.name, to: team.name } });
  }

  const session = await ensureSession();
  try {
    await db.transaction(async (tx) => {
      if (current) {
        await handOffCaptaincy(tx, current.player);
        await tx.delete(players).where(eq(players.id, current.player.id));
      }
      const rows = await tx
        .update(players)
        .set({ sessionId: session.id, lastSeenAt: new Date() })
        .where(and(eq(players.id, target.id), isNull(players.sessionId)))
        .returning({ id: players.id });
      // Someone else picked this name a moment ago: undo leaving the old team too.
      if (rows.length === 0) throw new AlreadyClaimedError();
    });
  } catch (err) {
    if (err instanceof AlreadyClaimedError) return fail(`${target.name} was just picked on another device.`);
    throw err;
  }

  publish(hunt.id, { type: "teams.changed", teamId: team.id });
  if (current) publish(hunt.id, { type: "teams.changed", teamId: current.team.id });
  refreshHunt(hunt);
  redirect(safeNextPath(next, hunt.slug) ?? home);
}

// Managing your team --------------------------------------------------------------

type TeamContext = { ok: false; error: string } | { ok: true; hunt: Hunt; me: PlayerContext };

/** The signed-in player's context for team actions, or a message saying why not. */
async function teamContext(huntId: string): Promise<TeamContext> {
  const hunt = await loadHunt(huntId);
  if (!hunt) return { ok: false, error: HUNT_GONE };
  const me = await getPlayer(hunt.id);
  if (!me) return { ok: false, error: NOT_JOINED };
  if (isOver(hunt)) return { ok: false, error: TEAM_FINAL };
  return { ok: true, hunt, me };
}

const UpdateTeamSchema = z.object({ huntId: zId, name: zTeamName, emoji: zTeamEmoji, color: zTeamColor });

export async function updateTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(UpdateTeamSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { huntId, name, emoji, color } = parsed.data;
  const ctx = await teamContext(huntId);
  if (!ctx.ok) return fail(ctx.error);
  const { hunt, me } = ctx;
  if (!me.player.isCaptain) return fail("Only the captain can change the team’s name and look.");
  if (await isTeamNameTaken(hunt.id, name, me.team.id)) return nameTakenState(hunt.id, name);

  try {
    await db
      .update(teams)
      .set({ name, nameKey: teamNameKey(name), emoji, color })
      .where(and(eq(teams.id, me.team.id), eq(teams.huntId, hunt.id)));
  } catch (err) {
    if (uniqueViolation(err) === "team-name") return nameTakenState(hunt.id, name);
    throw err;
  }
  publish(hunt.id, { type: "teams.changed", teamId: me.team.id });
  refreshHunt(hunt);
  return ok("Team updated.");
}

const NameSchema = z.object({ huntId: zId, name: zPlayerName });

export async function updateMyName(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(NameSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await teamContext(parsed.data.huntId);
  if (!ctx.ok) return fail(ctx.error);
  const { hunt, me } = ctx;
  await db
    .update(players)
    .set({ name: parsed.data.name })
    .where(and(eq(players.id, me.player.id), eq(players.huntId, hunt.id)));
  publish(hunt.id, { type: "teams.changed", teamId: me.team.id });
  refreshHunt(hunt);
  return ok("Name saved.");
}

const MemberSchema = z.object({ huntId: zId, playerId: zId });

type MemberContext =
  | { ok: false; state: ActionState<never> }
  | { ok: true; hunt: Hunt; me: PlayerContext; target: Player };

/** Captain only: another member of the same team. */
async function captainAndMember(formData: FormData): Promise<MemberContext> {
  const parsed = parseForm(MemberSchema, formData);
  if (!parsed.ok) return { ok: false, state: parsed.state };
  const ctx = await teamContext(parsed.data.huntId);
  if (!ctx.ok) return { ok: false, state: fail(ctx.error) };
  const { hunt, me } = ctx;
  if (!me.player.isCaptain) return { ok: false, state: fail("Only the captain can do that.") };
  if (parsed.data.playerId === me.player.id) return { ok: false, state: fail("Pick another member of your team.") };
  const target = await db
    .select()
    .from(players)
    .where(and(eq(players.id, parsed.data.playerId), eq(players.teamId, me.team.id), eq(players.huntId, hunt.id)))
    .get();
  if (!target) return { ok: false, state: fail("That player isn’t on your team any more.") };
  return { ok: true, hunt, me, target };
}

export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await captainAndMember(formData);
  if (!ctx.ok) return ctx.state;
  const { hunt, me, target } = ctx;
  await db.delete(players).where(and(eq(players.id, target.id), eq(players.teamId, me.team.id)));
  publish(hunt.id, { type: "teams.changed", teamId: me.team.id });
  refreshHunt(hunt);
  return ok(`${target.name} is off the team.`);
}

/**
 * Captain only: signs a member out of their old device (lost phone, cleared
 * browser) without removing them, so they can pick their name again on a new
 * device from the team's invite page.
 */
export async function signOutMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await captainAndMember(formData);
  if (!ctx.ok) return ctx.state;
  const { hunt, me, target } = ctx;
  if (!target.sessionId) return ok(`${target.name} can pick their name on a new device.`);
  await db
    .update(players)
    .set({ sessionId: null })
    .where(and(eq(players.id, target.id), eq(players.teamId, me.team.id)));
  publish(hunt.id, { type: "teams.changed", teamId: me.team.id });
  refreshHunt(hunt);
  return ok(`${target.name} can now pick their name on a new device.`);
}

export async function transferCaptain(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await captainAndMember(formData);
  if (!ctx.ok) return ctx.state;
  const { hunt, me, target } = ctx;
  // A captain nobody can act as would leave the team without anyone to manage it.
  if (!target.sessionId) {
    return fail(
      `${target.name} isn’t signed in on any device, so they couldn’t use the captain’s tools. Once they pick their name again from the team invite, you can hand over.`,
    );
  }
  await db.transaction(async (tx) => {
    await tx.update(players).set({ isCaptain: false }).where(eq(players.teamId, me.team.id));
    await tx.update(players).set({ isCaptain: true }).where(eq(players.id, target.id));
  });
  publish(hunt.id, { type: "teams.changed", teamId: me.team.id });
  refreshHunt(hunt);
  return ok(`${target.name} is now the captain.`);
}

const HuntOnlySchema = z.object({ huntId: zId });

/** Leaves the team on this device. The team, its submissions and points stay. */
export async function leaveTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(HuntOnlySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await teamContext(parsed.data.huntId);
  if (!ctx.ok) return fail(ctx.error);
  const { hunt, me } = ctx;
  await db.transaction(async (tx) => {
    await handOffCaptaincy(tx, me.player);
    await tx.delete(players).where(eq(players.id, me.player.id));
  });
  publish(hunt.id, { type: "teams.changed", teamId: me.team.id });
  refreshHunt(hunt);
  redirect(`/h/${hunt.slug}`);
}

/** Clears the Updates badge: everything up to now counts as seen. */
export async function markUpdatesSeen(huntId: string): Promise<void> {
  if (typeof huntId !== "string" || huntId.length > 64) return;
  const me = await getPlayer(huntId);
  if (!me) return;
  await db.update(players).set({ seenUpdatesAt: new Date() }).where(eq(players.id, me.player.id));
  refresh();
}
