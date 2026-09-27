import type { HuntStatus } from "@/lib/db/schema";
import { plural } from "@/lib/format";

/*
 * The overview's setup checklist for drafts and upcoming hunts. Each step is
 * computed from the hunt's data (never ticked by hand) and links to the page
 * where it gets done.
 */

export type SetupStepId = "tasks" | "schedule" | "judges" | "posters" | "publish" | "share";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  detail: string;
  done: boolean;
  href: string;
  /** Link text for the step's page. */
  cta: string;
};

export type SetupInput = {
  huntId: string;
  status: HuntStatus;
  hasStart: boolean;
  hasEnd: boolean;
  scheduleText: string;
  taskCount: number;
  checkpointCount: number;
  /** Staff members other than the viewer's own row, plus pending invites. */
  helperCount: number;
  inviteCount: number;
  playerCount: number;
  /** Checkpoints whose poster has been printed with their current code. */
  printedCheckpoints: number;
};

export function setupSteps(input: SetupInput): SetupStep[] {
  const base = `/manage/${input.huntId}`;
  const steps: SetupStep[] = [
    {
      id: "tasks",
      title: input.taskCount > 0 ? `${plural(input.taskCount, "task")} ready` : "Add tasks",
      detail:
        input.taskCount > 0
          ? input.taskCount < 8
            ? "Most hunts use 10 to 15. You can keep adding until it starts."
            : "Enough for a full hunt. You can keep editing until it starts."
          : "Most hunts use 10 to 15. Start with a few quick photo tasks.",
      done: input.taskCount > 0,
      href: `${base}/tasks`,
      cta: input.taskCount > 0 ? "Edit tasks" : "Add tasks",
    },
    {
      id: "schedule",
      title: input.hasStart && input.hasEnd ? "Start and end set" : "Set the start and end",
      detail:
        input.hasStart && input.hasEnd
          ? input.scheduleText
          : "Players see a countdown, and submissions close automatically at the end.",
      done: input.hasStart && input.hasEnd,
      href: `${base}/settings#schedule`,
      cta: input.hasStart && input.hasEnd ? "Change times" : "Set times",
    },
    {
      id: "judges",
      title: input.helperCount > 0 ? "Judges invited" : "Invite judges",
      detail:
        input.helperCount > 0
          ? input.inviteCount > 0 && input.helperCount === input.inviteCount
            ? `${plural(input.inviteCount, "invite link")} ready to share.`
            : "Your judging team is set up."
          : "Share an invite link so others can review submissions with you.",
      done: input.helperCount > 0,
      href: `${base}/settings#staff`,
      cta: input.helperCount > 0 ? "Manage staff" : "Invite judges",
    },
  ];
  if (input.checkpointCount > 0) {
    const printed = Math.min(input.printedCheckpoints, input.checkpointCount);
    const allPrinted = printed === input.checkpointCount;
    steps.push({
      id: "posters",
      title: allPrinted ? "Checkpoint posters printed" : "Print checkpoint posters",
      detail: allPrinted
        ? "Printed. Put each one up where its task says it is."
        : printed > 0
          ? `${printed} of ${input.checkpointCount} printed with their current code. Print the rest before the start.`
          : `${plural(input.checkpointCount, "checkpoint")} ${input.checkpointCount === 1 ? "needs" : "need"} a poster on site.`,
      done: allPrinted,
      href: `${base}/print/checkpoints`,
      cta: allPrinted ? "Print again" : "Print posters",
    });
  }
  const published = input.status !== "draft";
  steps.push({
    id: "publish",
    title: published ? "Published" : "Publish the hunt",
    detail: published ? "Teams can find the hunt and register." : "Players can’t see the hunt until it’s published.",
    done: published,
    href: published ? `${base}/settings#status` : `${base}#publish`,
    cta: published ? "Change status" : "Publish",
  });
  steps.push({
    id: "share",
    title: input.playerCount > 0 ? "Players are joining" : "Share the join code",
    detail:
      input.playerCount > 0
        ? `${plural(input.playerCount, "player")} joined so far.`
        : published
          ? "Put the poster up or send the link. This ticks off when the first player joins."
          : "Once it’s published, share the code or the poster. This ticks off when the first player joins.",
    done: input.playerCount > 0,
    href: `${base}#share`,
    cta: "Get the code",
  });
  return steps;
}
