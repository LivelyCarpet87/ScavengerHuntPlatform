"use client";

import { useParams } from "next/navigation";
import { StopScreen, StopScreenFrame } from "@/components/task/stop-screen";
import { ButtonLink } from "@/components/ui/button";
import { ControlMarker } from "@/components/ui/control";

/**
 * A task link that doesn't lead anywhere this player may go (unknown, hidden
 * or not unlocked yet). Same look as a checkpoint poster that can't be
 * punched; the page's metadata titles it "Task not open".
 */
export default function TaskNotFound() {
  const params = useParams<{ slug: string }>();
  return (
    <StopScreenFrame>
      <StopScreen
        mark={<ControlMarker code="?" state="locked" size="xl" label="A control that isn’t open" />}
        title="This task isn’t open"
        actions={
          <ButtonLink href={params?.slug ? `/h/${params.slug}` : "/"} size="lg">
            Back to tasks
          </ButtonLink>
        }
      >
        <p>It may not exist, or it hasn’t unlocked yet. New tasks show up on the task list as soon as they open.</p>
      </StopScreen>
    </StopScreenFrame>
  );
}
