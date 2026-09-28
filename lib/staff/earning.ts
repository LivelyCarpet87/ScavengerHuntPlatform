import type { TaskKind } from "@/lib/db/schema";
import type { ContestEntry } from "@/lib/scoring/engine";

export type EarningCandidate = {
  id: string;
  taskId: string;
  taskKind: TaskKind;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  contestValue: number | null;
};

/**
 * Which of a team's submissions each task's points belong to (taskId →
 * submission id), so the team's submission list can show the points beside
 * the entry that earned them. Mirrors the scoring engine:
 *   - standard tasks: the first accepted submission (the solve);
 *   - contests: the entry that set the team's place — its best value, its
 *     first entry ("first to finish"), or for totals the entry that completed
 *     the total. The engine reports that entry's time and value, so it's
 *     matched on those. No ranked entry (hidden team, no value yet): nothing.
 * Pure, so it can be tested without a database.
 */
export function earningSubmissions(
  subs: EarningCandidate[],
  contestEntry: (taskId: string) => ContestEntry | undefined,
): Map<string, string> {
  const accepted = new Map<string, EarningCandidate[]>();
  for (const s of subs) {
    if (s.status !== "approved") continue;
    const list = accepted.get(s.taskId) ?? [];
    list.push(s);
    accepted.set(s.taskId, list);
  }
  const earning = new Map<string, string>();
  for (const [taskId, list] of accepted) {
    if (list[0].taskKind === "contest") {
      const entry = contestEntry(taskId);
      if (!entry) continue;
      const atPlace = list.filter((s) => s.createdAt.getTime() === entry.at);
      const match = atPlace.find((s) => entry.value == null || s.contestValue === entry.value) ?? atPlace[0];
      if (match) earning.set(taskId, match.id);
      continue;
    }
    // The engine breaks ties on submission time by id.
    const first = list.reduce((a, b) => {
      const diff = b.createdAt.getTime() - a.createdAt.getTime();
      return diff < 0 || (diff === 0 && b.id < a.id) ? b : a;
    });
    earning.set(taskId, first.id);
  }
  return earning;
}
