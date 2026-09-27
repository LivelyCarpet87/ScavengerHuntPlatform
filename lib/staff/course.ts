import { seededRandom } from "@/lib/seeded";

/** A position on a hunt's map, in percent of the drawing's width (x) and height (y). */
export type CoursePoint = { x: number; y: number };

export const MAX_COURSE_CONTROLS = 18;

/**
 * Where to draw a hunt's course overprint on its terrain: a start triangle and
 * one control circle per task, scattered like a Score-O (no order, no lines),
 * spaced so the rings never touch. Deterministic per seed, so a hunt's map
 * looks the same on the dashboard, the overview and the poster.
 *
 * `aspect` is the drawing's width / height, used so the spacing looks even on
 * wide bands as well as squarer panels.
 */
export function coursePoints(seed: string, count: number, aspect = 3): { start: CoursePoint; controls: CoursePoint[] } {
  const rand = seededRandom(`course:${seed}`);
  const wanted = Math.max(0, Math.min(Math.floor(count), MAX_COURSE_CONTROLS));
  const padX = 7;
  const padY = 16;
  const pick = (): CoursePoint => ({
    x: round(padX + rand() * (100 - 2 * padX)),
    y: round(padY + rand() * (100 - 2 * padY)),
  });
  // Distances are measured in "percent of height" so both axes use one unit.
  const dist = (a: CoursePoint, b: CoursePoint) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

  const start = pick();
  const placed: CoursePoint[] = [start];
  let minDist = 34;
  let attempts = 0;
  while (placed.length < wanted + 1 && attempts < 6000) {
    attempts += 1;
    const p = pick();
    if (placed.every((q) => dist(p, q) >= minDist)) {
      placed.push(p);
    } else if (attempts % 150 === 0) {
      // Crowded course: relax the spacing a little and keep going.
      minDist *= 0.88;
    }
  }
  // Pathological seeds can still run out of attempts; fill the rest anywhere.
  while (placed.length < wanted + 1) placed.push(pick());
  return { start, controls: placed.slice(1) };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
