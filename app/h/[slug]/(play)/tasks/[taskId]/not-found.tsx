"use client";

import { useParams } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** A task link that doesn't lead anywhere this player may go (unknown, hidden or not unlocked yet). */
export default function TaskNotFound() {
  const params = useParams<{ slug: string }>();
  return (
    <EmptyState
      title="This task isn't open"
      action={
        <ButtonLink href={params?.slug ? `/h/${params.slug}` : "/"} variant="secondary" size="lg">
          Back to tasks
        </ButtonLink>
      }
    >
      It may not exist, or it hasn't unlocked yet. New tasks show up on the task list as soon as they open.
    </EmptyState>
  );
}
