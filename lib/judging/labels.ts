import type { SubmissionStatus, TaskKind } from "@/lib/db/schema";
import { ordinal } from "@/lib/format";

/** StatusBadge wording for decisions the system made. */
export function statusLabel(status: SubmissionStatus, autoJudged: boolean): string | undefined {
  if (!autoJudged) return undefined;
  if (status === "approved") return "Auto-accepted";
  if (status === "rejected") return "Auto-rejected";
  return undefined;
}

export const KIND_FILTERS: { value: TaskKind; label: string }[] = [
  { value: "media", label: "Photos and videos" },
  { value: "answer", label: "Answers" },
  { value: "contest", label: "Contests" },
  { value: "checkpoint", label: "Checkpoints" },
];

/** "Night Owls’" / "Moss Collective’s" */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** First name for compact attributions ("Sam approved …"). */
export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "Someone";
}

/** "184 cm", "31 bikes", "18.5" */
export function formatMeasured(value: number, unit: string | null | undefined): string {
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
  return unit ? `${n} ${unit}` : n;
}

/** "1st of 3" style place description for contest previews. */
export function placeLabel(place: number, places: number): string {
  return place <= places ? `${ordinal(place)} place` : `${ordinal(place)}, outside the ${places} scoring places`;
}
