/**
 * File names for exports. Pure, so the naming rules are unit-tested.
 */

/** ASCII slug for a path segment: "Night Owls!" -> "night-owls". Falls back when nothing is left (emoji-only names). */
export function safeSlug(input: string, fallback: string, maxLength = 48): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** "jpeg" -> "jpg"; anything odd becomes "bin". */
export function safeExt(ext: string): string {
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean === "jpeg") return "jpg";
  return clean.slice(0, 8) || "bin";
}

export type MediaEntryInput = {
  taskId: string;
  taskCode: number;
  taskTitle: string;
  teamId: string;
  teamName: string;
  ext: string;
};

/**
 * Names ZIP entries `<code>-<task-slug>/<team-slug>-<n>.<ext>`, numbering each
 * team's files per task from 1 in the order given. Two teams whose names slug
 * the same ("Night Owls" and "night owls!") get distinct folders' file names
 * ("night-owls-1.jpg" and "night-owls-2-1.jpg") so nothing is overwritten.
 */
export function mediaEntryNames(items: readonly MediaEntryInput[]): string[] {
  const teamSlugs = new Map<string, string>(); // `${taskId}:${teamId}` -> slug unique within the task folder
  const takenSlugs = new Map<string, Set<string>>(); // taskId -> slugs used
  const counters = new Map<string, number>(); // `${taskId}:${teamId}` -> files so far
  const used = new Set<string>();

  return items.map((item) => {
    const folder = `${item.taskCode}-${safeSlug(item.taskTitle, "task")}`;
    const key = `${item.taskId}:${item.teamId}`;
    let teamSlug = teamSlugs.get(key);
    if (!teamSlug) {
      const base = safeSlug(item.teamName, "team");
      const taken = takenSlugs.get(item.taskId) ?? new Set<string>();
      takenSlugs.set(item.taskId, taken);
      teamSlug = base;
      for (let i = 2; taken.has(teamSlug); i++) teamSlug = `${base}-${i}`;
      taken.add(teamSlug);
      teamSlugs.set(key, teamSlug);
    }
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    let name = `${folder}/${teamSlug}-${n}.${safeExt(item.ext)}`;
    // Task codes are unique per hunt, so this only guards against pathological input.
    for (let i = 2; used.has(name); i++) name = `${folder}/${teamSlug}-${n}-${i}.${safeExt(item.ext)}`;
    used.add(name);
    return name;
  });
}

/** "campus-night-hunt-standings.csv" */
export function exportFilename(huntSlug: string, kind: string): string {
  return `${safeSlug(huntSlug, "hunt", 64)}-${kind}`;
}
