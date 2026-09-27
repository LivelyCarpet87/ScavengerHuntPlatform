"use client";

import { ArrowLeftRight, Sparkles } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, fieldError, SubmitButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import type { ActionState } from "@/lib/actions";
import { normalizeCode } from "@/lib/ids";
import type { TeamColor } from "@/lib/palette";
import { createTeam, type JoinTeamState, joinTeam } from "@/lib/player/actions";
import { PLAYER_NAME_MAX, sanitizeCodeTyping, TEAM_NAME_MAX } from "@/lib/player/join";
import type { LeavingOutcome } from "@/lib/player/queries";
import { cn } from "@/lib/utils";
import { formSummary, useFocusFirstError } from "./form-feedback";
import { leavingNote } from "./leaving-note";
import { ColorPicker, EmojiPicker, TeamPreview } from "./team-look-picker";

/** Name fields hold a few words: keep them a comfortable width on wide screens. */
const NAME_FIELD = "sm:max-w-md";

/** "K7QM4P" typed any which way → "K7Q M4P" while typing. */
function formatTeamCodeTyping(raw: string): string {
  const clean = normalizeCode(raw).slice(0, 6);
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean;
}

/**
 * The submit area. `sticky` pins it to the bottom of the screen on phones so
 * the primary action stays under the thumb in a long form — only for pages
 * without the bottom tab bar (visitors who haven't joined).
 */
function ActionBar({
  children,
  sticky = false,
  className,
}: {
  children: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      data-bottom-bar={sticky ? "" : undefined}
      className={cn(
        "flex flex-col gap-3",
        sticky &&
          "sticky bottom-0 z-10 -mx-4 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type HuntCodeMode =
  | { mode: "none" }
  | { mode: "carried"; code: string }
  | { mode: "ask"; initial?: string; error?: string };

export function StartTeamForm({
  huntId,
  look,
  huntCode,
  next,
}: {
  huntId: string;
  look: { emoji: string; color: TeamColor };
  huntCode: HuntCodeMode;
  next: string | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createTeam, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [emoji, setEmoji] = useState(look.emoji);
  const [color, setColor] = useState<string>(look.color);
  const [code, setCode] = useState(huntCode.mode === "ask" ? sanitizeCodeTyping(huntCode.initial ?? "") : "");
  useFocusFirstError(formRef, state);

  const suggestion = fieldError(state, "nameSuggestion");
  const nameError = fieldError(state, "name");
  const codeError = fieldError(state, "huntCode") ?? (huntCode.mode === "ask" && !state ? huntCode.error : undefined);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="huntId" value={huntId} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {huntCode.mode === "carried" ? <input type="hidden" name="huntCode" value={huntCode.code} /> : null}

      <TeamPreview name={name} emoji={emoji} color={color} />

      {huntCode.mode === "ask" ? (
        <Field label="Hunt code" hint="The six digits on the hunt poster." error={codeError}>
          {(p) => (
            <Input
              {...p}
              name="huntCode"
              value={code}
              onChange={(e) => setCode(sanitizeCodeTyping(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="000 000"
              className="h-14 max-w-48 font-bib text-3xl tracking-[0.08em]"
            />
          )}
        </Field>
      ) : null}

      <div className="flex flex-col gap-2">
        <Field label="Team name" hint="Shown on the scoreboard." error={nameError} className={NAME_FIELD}>
          {(p) => (
            <Input
              {...p}
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={TEAM_NAME_MAX + 8}
              autoComplete="off"
              required
            />
          )}
        </Field>
        {suggestion ? (
          <Button
            variant="quiet"
            size="sm"
            className="self-start"
            onClick={() => {
              setName(suggestion);
              formRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
            }}
          >
            <Sparkles aria-hidden />
            Use “{suggestion}”
          </Button>
        ) : null}
      </div>

      <Field
        label="Your name"
        hint="So your teammates know who’s who."
        error={fieldError(state, "playerName")}
        className={NAME_FIELD}
      >
        {(p) => (
          <Input
            {...p}
            name="playerName"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={PLAYER_NAME_MAX + 8}
            autoComplete="given-name"
            required
          />
        )}
      </Field>

      <EmojiPicker value={emoji} onChange={setEmoji} error={fieldError(state, "emoji")} />
      <ColorPicker value={color} onChange={setColor} error={fieldError(state, "color")} />

      <ActionBar sticky>
        <FormMessage
          state={formSummary(state, [
            "name",
            "playerName",
            "emoji",
            "color",
            ...(huntCode.mode === "ask" ? ["huntCode"] : []),
          ])}
        />
        <SubmitButton size="lg" className="w-full sm:w-auto sm:self-start" pendingLabel="Creating team">
          Create team
        </SubmitButton>
      </ActionBar>
    </form>
  );
}

/**
 * Join an existing team. With `team`, the code comes from an invite link and
 * isn't shown; otherwise the player types it. When the device is already on
 * another team in this hunt, joining becomes an explicit "Move to …" step.
 */
export function JoinTeamForm({
  huntId,
  next,
  team,
  currentTeamName,
  currentTeamOutcome = "stays",
  defaultCode,
  defaultName,
  submitLabel = "Join team",
}: {
  huntId: string;
  next: string | null;
  team?: { code: string; name: string } | null;
  /** The device's current team in this hunt, if any. */
  currentTeamName?: string | null;
  /** What happens to the current team when this device moves off it. */
  currentTeamOutcome?: LeavingOutcome;
  defaultCode?: string;
  /** The name this device already plays under in the hunt (when moving teams). */
  defaultName?: string | null;
  submitLabel?: string;
}) {
  const [state, action] = useActionState<JoinTeamState, FormData>(joinTeam, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState(() => formatTeamCodeTyping(defaultCode ?? ""));
  const [playerName, setPlayerName] = useState(defaultName ?? "");
  const [dismissed, setDismissed] = useState<JoinTeamState>(null);
  useFocusFirstError(formRef, state);

  const asked = state?.ok && state !== dismissed ? state.data?.confirmMove : undefined;
  // On an invite link we already know both teams, so the move is confirmed up front.
  const moveFrom = team && currentTeamName ? currentTeamName : asked?.from;
  const moveTo = team && currentTeamName ? team.name : asked?.to;
  const fromOutcome = team && currentTeamName ? currentTeamOutcome : (asked?.fromOutcome ?? "stays");
  const confirming = !!moveFrom && !!moveTo;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="huntId" value={huntId} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {team ? <input type="hidden" name="teamCode" value={team.code} /> : null}
      {confirming ? <input type="hidden" name="confirmMove" value="1" /> : null}

      {team ? null : (
        <Field
          label="Team code"
          hint="Six letters and numbers. Your captain finds it on the Team tab."
          error={fieldError(state, "teamCode")}
        >
          {(p) => (
            <Input
              {...p}
              name="teamCode"
              value={code}
              onChange={(e) => {
                setCode(formatTeamCodeTyping(e.target.value));
                setDismissed(state);
              }}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ABC 123"
              className="h-16 max-w-60 font-bib text-4xl tracking-[0.06em] uppercase placeholder:text-ink-3/60"
            />
          )}
        </Field>
      )}

      <Field
        label="Your name"
        hint="So your teammates know who’s who."
        error={fieldError(state, "playerName")}
        className={NAME_FIELD}
      >
        {(p) => (
          <Input
            {...p}
            name="playerName"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={PLAYER_NAME_MAX + 8}
            autoComplete="given-name"
            required
          />
        )}
      </Field>

      {confirming ? (
        <Notice
          tone="warning"
          icon={<ArrowLeftRight className="size-4" />}
          title={`You’re on ${moveFrom} on this device`}
        >
          Joining {moveTo} moves you off {moveFrom}. {leavingNote(moveFrom, fromOutcome)}
        </Notice>
      ) : null}

      <ActionBar className="sm:flex-row sm:items-center">
        <FormMessage
          state={state?.ok ? null : formSummary(state, ["playerName", ...(team ? [] : ["teamCode"])])}
          className="sm:order-last"
        />
        <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Joining">
          {confirming ? `Move to ${moveTo}` : submitLabel}
        </SubmitButton>
        {asked ? (
          <Button variant="ghost" size="lg" onClick={() => setDismissed(state)}>
            Stay on {asked.from}
          </Button>
        ) : null}
      </ActionBar>
    </form>
  );
}
