# Scoring

All scores come from one pure function, `computeStandings()` in
`lib/scoring/engine.ts`, with unit tests in `lib/scoring/engine.test.ts`.
Every screen — team dashboard, scoreboard, big screen, staff view, exports —
reads the same result through `getStandings(huntId)`, which caches it until
something in the hunt changes.

A team's total is

```
task points + contest points − hint costs + manual adjustments
```

## Tasks

A team **solves** a task with its first accepted submission. Judges can award
a different amount on that submission ("Award different points"), which
replaces the computed value — use it for partial credit or a bonus.

Each task uses one of three scoring modes:

| Mode | Who gets what | Good for |
| --- | --- | --- |
| **Fixed** | Every solving team earns the task's points. | Most tasks. |
| **Rarity** | The value drops for *everyone* as more teams solve it. | Rewarding tasks few teams manage. |
| **Race** | The first team earns the most; each later team earns less. | "Be first" tasks. |

Rarity and race values fall along a gentle curve from the task's points (1st
solve) to its minimum (reached at "solves to minimum") and never go lower:

| Solves | 1 | 2 | 3 | 4 | 5 | 6+ |
| --- | --- | --- | --- | --- | --- | --- |
| 150 → 60 over 6 solves | 150 | 147 | 136 | 118 | 93 | 60 |

With **rarity**, if four teams have solved it, all four hold 118 — and the
fifth solve drops all five to 93. With **race**, the fourth team to solve it
earns 118 and keeps it.

Solve order uses the time the team **submitted**, not when a judge got to it,
so a slow queue never costs a team its place.

## Contests

Contest tasks rank entries instead of accepting them: judges record a measured
value on each accepted entry (184 cm, 31 bikes …), and teams are ranked by
their highest value, lowest value, total of all entries, or earliest accepted
entry. The top places earn points on a steep ladder from 1st place to the last
scoring place:

| Places | Points |
| --- | --- |
| 3 places, 200 → 60 | 200, 101, 60 |
| 5 places, 100 → 20 | 100, 61, 37, 25, 20 |

Ties on value go to the team that submitted first.

## Hints and adjustments

* Revealing a hint costs the team the hint's price at the moment they revealed
  it, whether or not they then solve the task.
* Organizers can add bonuses or penalties with a reason ("Helped another team",
  "Ran through the library"). Every adjustment is logged with who made it.

## Ranking

Higher total ranks higher. On equal totals, the team that reached its score
first ranks higher (the time of its last scoring submission). Teams equal on
both share a rank. Teams that haven't scored yet share the last rank.

## Hidden teams

Mark a team hidden to use it for test runs. Hidden teams get a score (staff can
see it) but never appear on the player scoreboard, never count toward rarity or
race solve counts, and never take contest places.

## Freezing the scoreboard

Set "Freeze the scoreboard at" in a hunt's settings to keep the final stretch
suspenseful. From that moment, players and the big screen see standings as of
the freeze: submissions made or judged after it, and hints or adjustments
added after it, don't show. Staff always see live scores. The freeze lifts
automatically when the hunt ends.

## Performance

`bun scripts/bench-scoring.ts` on a laptop:

| Event size | Compute time |
| --- | --- |
| 100 teams, 30 tasks, 3,000 submissions | ~2 ms |
| 500 teams, 60 tasks, 20,000 submissions | ~19 ms |
| 2,000 teams, 80 tasks, 100,000 submissions | ~140 ms |

Results are cached per hunt and recomputed only after a change, so a
scoreboard refreshed by hundreds of phones costs one computation per change.
