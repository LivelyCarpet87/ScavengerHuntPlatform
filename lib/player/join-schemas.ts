import { z } from "zod";
import { normalizeCode } from "@/lib/ids";
import { TEAM_COLOR_KEYS, TEAM_EMOJI, type TeamColor } from "@/lib/palette";
import { cleanName, PLAYER_NAME_MAX, TEAM_NAME_MAX, TEAM_NAME_MIN } from "./join";

/*
 * Form schemas for the join, invite and team actions. Kept apart from
 * ./join.ts on purpose: client components on the landing page and the hunt
 * pages import that module, and zod would otherwise ship to every player's
 * phone. Only server code (lib/player/actions.ts) and tests import this file.
 */

const zName = (min: number, max: number, tooShort: string, tooLong: string) =>
  z.preprocess((v) => (typeof v === "string" ? cleanName(v) : ""), z.string().min(min, tooShort).max(max, tooLong));

export const zTeamName = zName(
  TEAM_NAME_MIN,
  TEAM_NAME_MAX,
  "Give your team a name of at least 2 characters.",
  "Team names can be up to 32 characters.",
);

export const zPlayerName = zName(
  1,
  PLAYER_NAME_MAX,
  "Add your name so teammates know who’s who.",
  "Names can be up to 24 characters.",
);

export const zTeamEmoji = z
  .string({ message: "Pick an emoji for your team." })
  .refine((v) => TEAM_EMOJI.includes(v), "Pick an emoji from the list.");

export const zTeamColor = z.custom<TeamColor>(
  (v) => typeof v === "string" && (TEAM_COLOR_KEYS as string[]).includes(v),
  "Pick a color from the list.",
);

/** Team codes: 6 characters; accepts "K7Q M4P", "k7q-m4p" and the like. */
export const zTeamCode = z.preprocess(
  (v) => (typeof v === "string" ? normalizeCode(v) : ""),
  z.string().min(1, "Enter your team’s code.").length(6, "Team codes have 6 characters, like K7Q M4P."),
);
