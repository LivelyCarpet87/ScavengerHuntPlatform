"use client";

import { Info, QrCode } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/ui/choice";
import { Notice } from "@/components/ui/misc";
import type { TeamColor } from "@/lib/palette";
import type { JoinPolicy } from "@/lib/player/join";
import { useFormerTeam } from "./device-team";
import { type HuntCodeMode, JoinTeamForm, StartTeamForm } from "./join-forms";

type Mode = "start" | "join";

/** Why a visitor who followed a checkpoint or task link has to join first. */
function nextNote(next: string): string {
  if (next.includes("/cp/")) return "Join a team to punch that checkpoint. You’ll go straight back to it.";
  if (next.includes("/tasks/")) return "Join a team to open that task. You’ll go straight to it.";
  return "Join a team first. You’ll go straight back to where you were.";
}

/**
 * "Start a team" or "Join a team", as the hunt's registration rules allow.
 * A phone that was on a team until it was signed out or taken off (see
 * FormerTeamNotice) opens on "Join a team": getting back beats starting over.
 */
export function JoinPanel({
  huntId,
  policy,
  look,
  huntCode,
  maxTeamSize,
  next,
}: {
  huntId: string;
  policy: JoinPolicy;
  look: { emoji: string; color: TeamColor };
  huntCode: HuntCodeMode;
  maxTeamSize: number | null;
  next: string | null;
}) {
  const both = policy.canCreateTeam && policy.canJoinTeam;
  const former = useFormerTeam(huntId);
  const [picked, setPicked] = useState<Mode | null>(null);
  const mode: Mode = picked ?? (policy.canCreateTeam && !former ? "start" : "join");
  const sizeNote = maxTeamSize ? ` Teams in this hunt have up to ${maxTeamSize} players.` : "";

  return (
    <section aria-labelledby="join-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="join-heading" className="font-cond text-3xl font-extrabold tracking-tight sm:text-4xl">
          Join the hunt
        </h2>
        <p className="mt-1 max-w-prose text-ink-2">
          {both
            ? "Start a team and invite your friends, or join a team that’s already set up."
            : "Join your team with the code your captain shares."}
          {sizeNote}
        </p>
      </div>
      {/* Deeper than the hunt home: say why the page asks to join first. */}
      {next && next.split("/").length > 3 ? (
        <Notice
          tone="info"
          icon={
            next.includes("/cp/") ? <QrCode aria-hidden className="size-4" /> : <Info aria-hidden className="size-4" />
          }
        >
          {nextNote(next)}
        </Notice>
      ) : null}
      {both ? (
        <Segmented
          // Remounts once when the device's former team is read after hydration, to open on "Join a team".
          key={former ? "former" : "fresh"}
          name="join-mode"
          label="How do you want to join?"
          defaultValue={mode}
          onChange={(v) => setPicked(v as Mode)}
          className="grid w-full grid-cols-2 sm:max-w-sm"
          options={[
            { value: "start", label: "Start a team" },
            { value: "join", label: "Join a team" },
          ]}
        />
      ) : null}
      {!policy.canCreateTeam && policy.createNote ? <Notice tone="info">{policy.createNote}</Notice> : null}
      {mode === "start" && policy.canCreateTeam ? (
        <StartTeamForm huntId={huntId} look={look} huntCode={huntCode} next={next} />
      ) : (
        <JoinTeamForm huntId={huntId} next={next} />
      )}
    </section>
  );
}
