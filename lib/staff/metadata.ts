import "server-only";
import type { Metadata } from "next";
import { getStaffRole, roleAtLeast } from "@/lib/auth/access";
import type { Hunt, StaffRole } from "@/lib/db/schema";
import { getHuntById } from "@/lib/hunts";

/**
 * The tab title of an organizer page, naming the hunt it belongs to:
 * "Night Owls – Campus Night Hunt" (the root layout appends the app name).
 * With several hunts, teams or tasks open in tabs they can be told apart,
 * and screen readers announce where a navigation landed (WCAG 2.4.2).
 *
 * `page` names the specific thing (a team, a task); `fallback` is used when
 * it's gone, and on its own for visitors without `min` role on the hunt, so a
 * title never reveals a hunt, team or task. Role and hunt lookups are cached
 * per request, so the page itself doesn't query them again.
 */
export async function staffTitle(
  huntId: string,
  fallback: string,
  opts: { min?: StaffRole; page?: (hunt: Hunt) => Promise<string | null | undefined> | string | null | undefined } = {},
): Promise<Metadata> {
  const role = await getStaffRole(huntId);
  const hunt = roleAtLeast(role, opts.min ?? "judge") ? await getHuntById(huntId) : null;
  if (!hunt) return { title: fallback };
  const part = (opts.page ? await opts.page(hunt) : null) || fallback;
  return { title: `${part} – ${hunt.name}` };
}
