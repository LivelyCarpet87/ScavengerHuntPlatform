"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { type ActionState, fail, ok, parseForm } from "@/lib/actions";
import { getPlayer } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { hints, hintUnlocks, submissions, tasks } from "@/lib/db/schema";
import { getHuntById, submissionBlockReason } from "@/lib/hunts";
import { publish } from "@/lib/realtime/bus";

export type RevealedHint = { hintId: string; body: string; cost: number };

const RevealSchema = z.object({
  hintId: z.string({ message: "Choose a hint to reveal." }).trim().min(1, "Choose a hint to reveal.").max(64),
});

/**
 * Reveals a hint for the player's team. Idempotent: revealing a hint the team
 * already has returns its text without charging again. The cost is recorded
 * as it was at the moment of reveal, so later edits don't rewrite history.
 */
export async function revealHint(
  _prev: ActionState<RevealedHint>,
  formData: FormData,
): Promise<ActionState<RevealedHint>> {
  const parsed = parseForm(RevealSchema, formData);
  if (!parsed.ok) return parsed.state;

  const hint = await db.select().from(hints).where(eq(hints.id, parsed.data.hintId)).get();
  if (!hint) return fail("That hint doesn't exist any more. Reload the page.");
  const hunt = await getHuntById(hint.huntId);
  if (!hunt) return fail("That hint doesn't exist any more. Reload the page.");
  const me = await getPlayer(hunt.id);
  if (!me) return fail("Join the hunt first.");

  const task = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, hint.taskId), eq(tasks.huntId, hunt.id)))
    .get();
  if (!task) return fail("That hint doesn't exist any more. Reload the page.");

  const already = await db
    .select({ cost: hintUnlocks.cost })
    .from(hintUnlocks)
    .where(and(eq(hintUnlocks.hintId, hint.id), eq(hintUnlocks.teamId, me.team.id)))
    .get();
  if (already) return ok("Hint revealed.", { hintId: hint.id, body: hint.body, cost: already.cost });

  const blocked = submissionBlockReason(hunt, task);
  if (blocked) return fail(blocked);
  if (task.kind !== "contest") {
    const history = await db
      .select({ status: submissions.status })
      .from(submissions)
      .where(and(eq(submissions.teamId, me.team.id), eq(submissions.taskId, task.id)));
    if (history.some((s) => s.status === "approved")) {
      return fail("Your team already completed this task, so this hint won't help.");
    }
    const wrong = history.filter((s) => s.status === "rejected").length;
    if (task.kind === "answer" && task.maxAttempts != null && wrong >= task.maxAttempts) {
      return fail("Your team is out of attempts for this task, so this hint won't help.");
    }
  }

  const inserted = await db
    .insert(hintUnlocks)
    .values({ hintId: hint.id, teamId: me.team.id, huntId: hunt.id, playerId: me.player.id, cost: hint.cost })
    .onConflictDoNothing()
    .returning({ cost: hintUnlocks.cost });

  if (inserted.length > 0) {
    // Teammates' pages and the scoreboard pick up the new total.
    publish(hunt.id, { type: "scores.changed", teamId: me.team.id });
    refresh();
  }
  return ok("Hint revealed.", { hintId: hint.id, body: hint.body, cost: inserted[0]?.cost ?? hint.cost });
}
