import { seededRandom } from "./seeded";

/**
 * Orienteering pin-punch patterns. Each control's punch leaves a unique
 * arrangement of holes on the competitor's card; here every task gets one,
 * derived from its id, and it appears when a team completes the task.
 *
 * Returns hole positions as [column, row] on a 4×4 grid.
 */
export function punchPattern(seed: string): [number, number][] {
  const rand = seededRandom(`punch:${seed}`);
  const cells: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push([c, r]);
  // Fisher–Yates shuffle, then keep 6–8 holes.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const count = 6 + Math.floor(rand() * 3);
  const holes = cells.slice(0, count);
  // Make sure the pattern spans at least three rows and columns so it reads as a pattern, not a line.
  const rows = new Set(holes.map(([, r]) => r));
  const cols = new Set(holes.map(([c]) => c));
  if (rows.size < 3 || cols.size < 3) return punchPattern(`${seed}+`);
  return holes.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
