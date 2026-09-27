"use server";

import { and, asc, count, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm, zCheckbox } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { type Hunt, players, submissions, teams } from "@/lib/db/schema";
import { formatCode, newCode, newId } from "@/lib/ids";
import { pickRandom, TEAM_COLOR_KEYS, TEAM_EMOJI, type TeamColor } from "@/lib/palette";
import { publish } from "@/lib/realtime/bus";
import { deleteFiles } from "@/lib/storage";
import { revalidateHunt, runBatch } from "./batch";
import { isUniqueViolation, uniqueTeamCode } from "./codes";
import { ownedFiles } from "./files";
import {
  cleanName,
  listSentence,
  PLAYER_NAME_MAX,
  parseTeamNames,
  quoted,
  TEAM_NAME_MAX,
  TEAM_NAME_MIN,
  teamNameKey,
} from "./text";
import { zId, zLongText, zText } from "./zod";

/*
 * Team management. Teams created here are marked origin "staff". Changes
 * publish teams.changed (and scores.changed when the scoreboard is affected).
 */

const MAX_BULK = 100;

export type CreatedTeams = { created: { id: string; name: string }[]; skipped: string[] };

const AddTeamsSchema = z.object({ huntId: zId, names: zLongText("the list", 10_000) });

export async function addTeamsAction(
  _prev: ActionState<CreatedTeams>,
  formData: FormData,
): Promise<ActionState<CreatedTeams>> {
  const parsed = parseForm(AddTeamsSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const list = parseTeamNames(parsed.data.names);
  if (list.names.length === 0 && list.tooLong.length === 0 && list.tooShort.length === 0) {
    return fail("Type at least one team name.", { names: "Type one team name per line." });
  }
  if (list.names.length > MAX_BULK) {
    return fail(`Add up to ${MAX_BULK} teams at a time.`, {
      names: `That’s ${list.names.length} names. Split the list.`,
    });
  }

  const existing = await db
    .select({ nameKey: teams.nameKey, emoji: teams.emoji, color: teams.color, code: teams.code })
    .from(teams)
    .where(eq(teams.huntId, hunt.id));
  const takenKeys = new Set(existing.map((t) => t.nameKey));
  const skippedExisting = list.names.filter((n) => takenKeys.has(teamNameKey(n)));
  const fresh = list.names.filter((n) => !takenKeys.has(teamNameKey(n)));

  // Spread identities: unused emoji and colors first, so teams are easy to tell apart.
  const usedEmoji = new Set(existing.map((t) => t.emoji));
  const usedColors = existing.map((t) => t.color);
  const takenCodes = new Set(existing.map((t) => t.code));
  const rows: (typeof teams.$inferInsert)[] = [];
  for (const name of fresh) {
    const emojiPool = TEAM_EMOJI.filter((e) => !usedEmoji.has(e));
    const emoji = pickRandom(emojiPool.length > 0 ? emojiPool : TEAM_EMOJI);
    usedEmoji.add(emoji);
    const color = leastUsedColor(usedColors);
    usedColors.push(color);
    let code = newCode(6);
    while (takenCodes.has(code)) code = newCode(6);
    takenCodes.add(code);
    rows.push({
      id: newId(),
      huntId: hunt.id,
      name,
      nameKey: teamNameKey(name),
      emoji,
      color,
      code,
      origin: "staff",
    });
  }
  if (rows.length > 0) {
    try {
      await db.insert(teams).values(rows);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return fail("Someone added a team with one of these names at the same time. Try again.");
      }
      throw err;
    }
    await audit({
      huntId: hunt.id,
      actorUserId: user.id,
      action: "team.bulk_create",
      targetKind: "team",
      data: { count: rows.length, names: rows.map((r) => r.name) },
    });
    publish(hunt.id, { type: "teams.changed" });
    revalidateHunt(hunt.id);
  }

  const skipped = [...skippedExisting, ...list.repeated, ...list.tooLong, ...list.tooShort];
  const parts: string[] = [];
  parts.push(rows.length === 0 ? "No new teams." : `Created ${rows.length} ${rows.length === 1 ? "team" : "teams"}.`);
  if (skippedExisting.length > 0) {
    parts.push(`Skipped ${listSentence(quoted(skippedExisting))}: already in this hunt.`);
  }
  if (list.repeated.length > 0) {
    parts.push(
      `${listSentence(quoted(list.repeated))} ${list.repeated.length === 1 ? "was" : "were"} listed more than once, so added once.`,
    );
  }
  if (list.tooLong.length > 0) {
    parts.push(`Skipped ${listSentence(quoted(list.tooLong))}: team names can be up to ${TEAM_NAME_MAX} characters.`);
  }
  if (list.tooShort.length > 0) {
    parts.push(`Skipped ${listSentence(quoted(list.tooShort))}: team names need at least ${TEAM_NAME_MIN} characters.`);
  }
  const data: CreatedTeams = { created: rows.map((r) => ({ id: r.id as string, name: r.name })), skipped };
  if (rows.length === 0) return fail(parts.join(" "));
  return ok(parts.join(" "), data);
}

function leastUsedColor(used: string[]): TeamColor {
  const counts = new Map<TeamColor, number>(TEAM_COLOR_KEYS.map((k) => [k, 0]));
  for (const c of used)
    if (counts.has(c as TeamColor)) counts.set(c as TeamColor, (counts.get(c as TeamColor) ?? 0) + 1);
  const min = Math.min(...counts.values());
  return pickRandom(TEAM_COLOR_KEYS.filter((k) => counts.get(k) === min));
}

async function loadTeam(hunt: Hunt, teamId: string) {
  return (
    (await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.huntId, hunt.id)))
      .get()) ?? null
  );
}

const UpdateTeamSchema = z.object({
  huntId: zId,
  teamId: zId,
  name: zText("the team name", { min: TEAM_NAME_MIN, max: TEAM_NAME_MAX }),
  emoji: z.string().trim().min(1, "Pick an emoji.").max(16, "Pick an emoji."),
  color: z.enum(TEAM_COLOR_KEYS as [TeamColor, ...TeamColor[]], { message: "Pick a color." }),
  hidden: zCheckbox,
});

export async function updateTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(UpdateTeamSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const { user, hunt } = await requireStaff(d.huntId, "organizer");
  const team = await loadTeam(hunt, d.teamId);
  if (!team) return fail("This team no longer exists. Someone may have deleted it.");
  if (d.emoji !== team.emoji && !TEAM_EMOJI.includes(d.emoji)) return fail("Pick one of the emoji shown.");
  const name = cleanName(d.name);
  if (name.length < TEAM_NAME_MIN) {
    const message = `Team names need at least ${TEAM_NAME_MIN} characters.`;
    return fail(message, { name: message });
  }
  const nameKey = teamNameKey(name);
  const clash = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.huntId, hunt.id), eq(teams.nameKey, nameKey), ne(teams.id, team.id)))
    .get();
  if (clash) return fail("Another team already has that name.", { name: "Another team already has that name." });
  try {
    await db
      .update(teams)
      .set({ name, nameKey, emoji: d.emoji, color: d.color, hidden: d.hidden })
      .where(and(eq(teams.id, team.id), eq(teams.huntId, hunt.id)));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail("Another team already has that name.", { name: "Another team just took that name." });
    }
    throw err;
  }
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "team.update",
    targetKind: "team",
    targetId: team.id,
    data: {
      ...(name !== team.name ? { name: { from: team.name, to: name } } : {}),
      ...(d.hidden !== team.hidden ? { hidden: d.hidden } : {}),
    },
  });
  publish(hunt.id, { type: "teams.changed", teamId: team.id });
  publish(hunt.id, { type: "scores.changed", teamId: team.id });
  revalidateHunt(hunt.id);
  return ok(
    d.hidden !== team.hidden
      ? d.hidden
        ? "Saved. The team is hidden from the scoreboard."
        : "Saved. The team is back on the scoreboard."
      : "Team saved.",
  );
}

const TeamRef = z.object({ huntId: zId, teamId: zId });

export async function regenerateTeamCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(TeamRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const team = await loadTeam(hunt, parsed.data.teamId);
  if (!team) return fail("This team no longer exists. Someone may have deleted it.");
  let code = await uniqueTeamCode(hunt.id);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await db
        .update(teams)
        .set({ code })
        .where(and(eq(teams.id, team.id), eq(teams.huntId, hunt.id)));
      break;
    } catch (err) {
      // A new team took the same code at the same moment: draw another.
      if (isUniqueViolation(err) && attempt < 3) {
        code = await uniqueTeamCode(hunt.id);
        continue;
      }
      throw err;
    }
  }
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "team.code",
    targetKind: "team",
    targetId: team.id,
    data: { from: team.code, to: code },
  });
  publish(hunt.id, { type: "teams.changed", teamId: team.id });
  revalidateHunt(hunt.id);
  return ok(`New team code: ${formatCode(code)}. The old code and its QR no longer work.`);
}

export async function deleteTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(TeamRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const team = await loadTeam(hunt, parsed.data.teamId);
  if (!team) redirect(`/manage/${hunt.id}/teams`);
  const subs = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.huntId, hunt.id), eq(submissions.teamId, team.id)));
  const subFiles = await ownedFiles(
    hunt.id,
    "submission",
    subs.map((s) => s.id),
  );
  // Players, submissions, hint reveals and adjustments go with the team (cascade).
  await db.delete(teams).where(and(eq(teams.id, team.id), eq(teams.huntId, hunt.id)));
  await deleteFiles(subFiles);
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "team.delete",
    targetKind: "team",
    targetId: team.id,
    data: { name: team.name, submissions: subs.length },
  });
  publish(hunt.id, { type: "teams.changed", teamId: team.id });
  publish(hunt.id, { type: "scores.changed" });
  revalidateHunt(hunt.id);
  // The list reads the name back from the audit entry, so the notice can't be spoofed by a crafted link.
  redirect(`/manage/${hunt.id}/teams?deleted=${team.id}`);
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

async function loadPlayer(hunt: Hunt, playerId: string) {
  return (
    (await db
      .select()
      .from(players)
      .where(and(eq(players.id, playerId), eq(players.huntId, hunt.id)))
      .get()) ?? null
  );
}

/** When a captain leaves a team, the longest-standing remaining member takes over. */
async function ensureCaptain(huntId: string, teamId: string) {
  const members = await db
    .select({ id: players.id, isCaptain: players.isCaptain })
    .from(players)
    .where(and(eq(players.huntId, huntId), eq(players.teamId, teamId)))
    .orderBy(asc(players.createdAt));
  if (members.length === 0 || members.some((m) => m.isCaptain)) return;
  await db.update(players).set({ isCaptain: true }).where(eq(players.id, members[0].id));
}

const RenamePlayerSchema = z.object({ huntId: zId, playerId: zId, name: zText("a name", { max: PLAYER_NAME_MAX }) });

export async function renamePlayerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(RenamePlayerSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const player = await loadPlayer(hunt, parsed.data.playerId);
  if (!player) return fail("This player is no longer in the hunt.");
  const name = cleanName(parsed.data.name);
  if (!name) return fail("Enter a name.", { name: "Enter a name." });
  await db
    .update(players)
    .set({ name })
    .where(and(eq(players.id, player.id), eq(players.huntId, hunt.id)));
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "player.rename",
    targetKind: "player",
    targetId: player.id,
    data: { from: player.name, to: name },
  });
  publish(hunt.id, { type: "teams.changed", teamId: player.teamId });
  revalidateHunt(hunt.id);
  return ok("Name saved.");
}

const MovePlayerSchema = z.object({ huntId: zId, playerId: zId, toTeamId: zId });

export async function movePlayerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(MovePlayerSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const player = await loadPlayer(hunt, parsed.data.playerId);
  if (!player) return fail("This player is no longer in the hunt.");
  const target = await loadTeam(hunt, parsed.data.toTeamId);
  if (!target) return fail("Pick a team in this hunt.", { toTeamId: "Pick a team in this hunt." });
  if (target.id === player.teamId) return ok(`${player.name} is already in ${target.name}.`);
  await db
    .update(players)
    .set({ teamId: target.id, isCaptain: false })
    .where(and(eq(players.id, player.id), eq(players.huntId, hunt.id)));
  await ensureCaptain(hunt.id, player.teamId);
  await ensureCaptain(hunt.id, target.id);
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "player.move",
    targetKind: "player",
    targetId: player.id,
    data: { name: player.name, from: player.teamId, to: target.id },
  });
  publish(hunt.id, { type: "teams.changed", teamId: player.teamId });
  publish(hunt.id, { type: "teams.changed", teamId: target.id });
  revalidateHunt(hunt.id);
  // Staff may overfill a team on purpose; say so rather than refuse.
  const size = (
    await db
      .select({ n: count() })
      .from(players)
      .where(and(eq(players.huntId, hunt.id), eq(players.teamId, target.id)))
      .get()
  )?.n;
  const over =
    hunt.maxTeamSize != null && size != null && size > hunt.maxTeamSize
      ? ` ${target.name} now has ${size} players, over the limit of ${hunt.maxTeamSize}.`
      : "";
  return ok(`${player.name} moved to ${target.name}. Points they earned stay with their old team.${over}`);
}

const PlayerRef = z.object({ huntId: zId, playerId: zId });

export async function removePlayerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(PlayerRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const player = await loadPlayer(hunt, parsed.data.playerId);
  if (!player) return ok("Removed.");
  await db.delete(players).where(and(eq(players.id, player.id), eq(players.huntId, hunt.id)));
  await ensureCaptain(hunt.id, player.teamId);
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "player.remove",
    targetKind: "player",
    targetId: player.id,
    data: { name: player.name, teamId: player.teamId },
  });
  publish(hunt.id, { type: "teams.changed", teamId: player.teamId });
  revalidateHunt(hunt.id);
  return ok(`${player.name} removed. Their submissions stay with the team.`);
}

export async function makeCaptainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(PlayerRef, formData);
  if (!parsed.ok) return parsed.state;
  const { user, hunt } = await requireStaff(parsed.data.huntId, "organizer");
  const player = await loadPlayer(hunt, parsed.data.playerId);
  if (!player) return fail("This player is no longer in the hunt.");
  await runBatch([
    db
      .update(players)
      .set({ isCaptain: false })
      .where(and(eq(players.huntId, hunt.id), eq(players.teamId, player.teamId))),
    db
      .update(players)
      .set({ isCaptain: true })
      .where(and(eq(players.id, player.id), eq(players.huntId, hunt.id))),
  ]);
  await audit({
    huntId: hunt.id,
    actorUserId: user.id,
    action: "player.captain",
    targetKind: "player",
    targetId: player.id,
    data: { name: player.name, teamId: player.teamId },
  });
  publish(hunt.id, { type: "teams.changed", teamId: player.teamId });
  revalidateHunt(hunt.id);
  return ok(`${player.name} is now captain.`);
}
