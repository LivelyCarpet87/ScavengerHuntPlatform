/**
 * Colors and marks available to hunts and teams. Hunt accents come from the
 * orienteering map palette (ISOM): overprint purple, water blue, vegetation
 * green, contour brown, open-land yellow and rock black.
 */

import type { Accent } from "@/lib/db/schema";

export type Swatch = { label: string; hex: string; hexDark: string; ink: string };

export const ACCENT_SWATCHES: Record<Accent, Swatch> = {
  overprint: { label: "Overprint purple", hex: "#A3129B", hexDark: "#E46BDC", ink: "#FFFFFF" },
  water: { label: "Water blue", hex: "#0068AD", hexDark: "#5BB8F5", ink: "#FFFFFF" },
  forest: { label: "Forest green", hex: "#1B7A3E", hexDark: "#52C77C", ink: "#FFFFFF" },
  contour: { label: "Contour brown", hex: "#A64B12", hexDark: "#E8955A", ink: "#FFFFFF" },
  sun: { label: "Open-land yellow", hex: "#FFC21A", hexDark: "#FFD34D", ink: "#1A1300" },
  ink: { label: "Rock black", hex: "#16161A", hexDark: "#F2F2F4", ink: "#FFFFFF" },
};

/** Team identity colors — distinct at a glance on a projector and for common color-vision deficiencies when paired with the emoji. */
export const TEAM_COLORS = {
  plum: { label: "Plum", hex: "#8E1B86" },
  lake: { label: "Lake", hex: "#0068AD" },
  moss: { label: "Moss", hex: "#2F7D32" },
  rust: { label: "Rust", hex: "#B4461A" },
  gold: { label: "Gold", hex: "#C99400" },
  teal: { label: "Teal", hex: "#00827F" },
  rose: { label: "Rose", hex: "#C92A5E" },
  indigo: { label: "Indigo", hex: "#4B3FB3" },
  slate: { label: "Slate", hex: "#4E5A66" },
  olive: { label: "Olive", hex: "#6C7A12" },
  coral: { label: "Coral", hex: "#E0562E" },
  sky: { label: "Sky", hex: "#2E8BD1" },
} as const;

export type TeamColor = keyof typeof TEAM_COLORS;
export const TEAM_COLOR_KEYS = Object.keys(TEAM_COLORS) as TeamColor[];

export function teamColorHex(color: string): string {
  return (TEAM_COLORS as Record<string, { hex: string }>)[color]?.hex ?? TEAM_COLORS.slate.hex;
}

export const TEAM_EMOJI = [
  "🦔",
  "🦊",
  "🦉",
  "🐸",
  "🐙",
  "🦦",
  "🐝",
  "🦩",
  "🐢",
  "🦀",
  "🐧",
  "🦥",
  "🐿️",
  "🦝",
  "🐺",
  "🦄",
  "🐳",
  "🦜",
  "🐞",
  "🦕",
  "🐌",
  "🦘",
  "🐼",
  "🦫",
  "🐉",
  "🦅",
  "🐬",
  "🦭",
  "🐫",
  "🦚",
];

export function pickRandom<T>(list: readonly T[]): T {
  const i = crypto.getRandomValues(new Uint32Array(1))[0] % list.length;
  return list[i];
}
