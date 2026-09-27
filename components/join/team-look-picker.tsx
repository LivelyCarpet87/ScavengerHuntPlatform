"use client";

import { Check } from "lucide-react";
import { TeamAvatar } from "@/components/ui/team-badge";
import { TEAM_COLOR_KEYS, TEAM_COLORS, TEAM_EMOJI, type TeamColor } from "@/lib/palette";
import { cn } from "@/lib/utils";

/*
 * Emoji and color for a team, as native radio groups (they submit with the
 * form, and arrow keys move between options). Controlled, so a failed submit
 * never loses the choice.
 */

export function EmojiPicker({
  value,
  onChange,
  error,
  className,
}: {
  value: string;
  onChange: (emoji: string) => void;
  error?: string;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-sm font-semibold text-ink">Emoji</legend>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {TEAM_EMOJI.map((emoji) => (
          <label
            key={emoji}
            className={cn(
              "grid aspect-square min-h-12 cursor-pointer place-items-center rounded-md bg-mist text-[1.65rem] leading-none transition-[background-color,box-shadow] duration-150 select-none hover:bg-mist-2",
              "has-checked:bg-paper has-checked:shadow-[inset_0_0_0_2.5px_var(--ink)]",
              "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-overprint",
            )}
          >
            <input
              type="radio"
              name="emoji"
              value={emoji}
              checked={value === emoji}
              onChange={() => onChange(emoji)}
              className="sr-only"
            />
            {emoji}
          </label>
        ))}
      </div>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}

export function ColorPicker({
  value,
  onChange,
  error,
  className,
}: {
  value: string;
  onChange: (color: TeamColor) => void;
  error?: string;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-sm font-semibold text-ink">Color</legend>
      <div className="grid grid-cols-6 gap-1.5 sm:flex sm:flex-wrap sm:gap-1">
        {TEAM_COLOR_KEYS.map((key) => {
          const swatch = TEAM_COLORS[key];
          const checked = value === key;
          return (
            <label
              key={key}
              title={swatch.label}
              className="grid min-h-12 cursor-pointer place-items-center rounded-md has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-overprint sm:size-12"
            >
              <input
                type="radio"
                name="color"
                value={key}
                checked={checked}
                onChange={() => onChange(key)}
                className="sr-only"
              />
              <span className="sr-only">{swatch.label}</span>
              <span
                aria-hidden
                className={cn(
                  "grid size-9 place-items-center rounded-full text-white transition-shadow duration-150",
                  checked && "shadow-[0_0_0_2.5px_var(--paper),0_0_0_5px_var(--ink)]",
                )}
                style={{ background: swatch.hex }}
              >
                {checked ? <Check className="size-5" strokeWidth={3} /> : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}

/** Live preview of how the team shows up on the scoreboard. */
export function TeamPreview({
  name,
  emoji,
  color,
  placeholder = "Your team",
  className,
}: {
  name: string;
  emoji: string;
  color: string;
  placeholder?: string;
  className?: string;
}) {
  const shown = name.trim() || placeholder;
  return (
    <div className={cn("flex min-w-0 items-center gap-4", className)}>
      <TeamAvatar team={{ name: shown, emoji, color }} size="xl" />
      <p
        className={cn(
          "min-w-0 font-cond text-3xl leading-none font-extrabold tracking-tight break-words",
          !name.trim() && "text-ink-3",
        )}
      >
        {shown}
      </p>
    </div>
  );
}
