/**
 * Benchmarks the scoring engine on synthetic events of increasing size.
 *   bun scripts/bench-scoring.ts
 */
import { computeStandings, type EngineInput, type EngineTask } from "../lib/scoring/engine";
import { seededRandom } from "../lib/seeded";

function event(teams: number, tasks: number, subsPerTeam: number): EngineInput {
  const rand = seededRandom(`bench:${teams}:${tasks}`);
  const modes = ["fixed", "rarity", "race"] as const;
  const taskList: EngineTask[] = Array.from({ length: tasks }, (_, i) => ({
    id: `t${i}`,
    kind: i % 10 === 9 ? "contest" : "media",
    scoring: modes[i % 3],
    points: 100 + (i % 5) * 20,
    minPoints: 20,
    decaySolves: 10,
    contestRank: "highest",
    contestPlaces: 3,
  }));
  const start = Date.UTC(2026, 8, 27, 18);
  const submissions = [];
  let n = 0;
  for (let t = 0; t < teams; t++) {
    for (let s = 0; s < subsPerTeam; s++) {
      const task = taskList[Math.floor(rand() * tasks)];
      submissions.push({
        id: `s${n++}`,
        taskId: task.id,
        teamId: `team${t}`,
        status: rand() < 0.75 ? ("approved" as const) : ("rejected" as const),
        submittedAt: start + Math.floor(rand() * 3 * 3600_000),
        judgedAt: start + 3 * 3600_000,
        pointsOverride: null,
        contestValue: task.kind === "contest" ? Math.round(rand() * 200) : null,
      });
    }
  }
  return {
    teams: Array.from({ length: teams }, (_, i) => ({ id: `team${i}`, name: `Team ${i}`, hidden: i === 0 })),
    tasks: taskList,
    submissions,
    hintUnlocks: Array.from({ length: teams }, (_, i) => ({ teamId: `team${i}`, cost: 10, at: start })),
    adjustments: [],
  };
}

for (const [teams, tasks, per] of [
  [20, 15, 15],
  [100, 30, 30],
  [500, 60, 40],
  [2000, 80, 50],
] as const) {
  const input = event(teams, tasks, per);
  computeStandings(input); // warm up
  const runs = 5;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) computeStandings(input);
  const ms = (performance.now() - t0) / runs;
  console.log(
    `${String(teams).padStart(5)} teams × ${String(tasks).padStart(3)} tasks, ${String(input.submissions.length).padStart(6)} submissions: ${ms.toFixed(1)} ms`,
  );
}
