"use client";

import { Rocket } from "lucide-react";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { publishHuntAction } from "@/lib/staff/hunt-actions";
import { ConfirmAction } from "./confirm-action";

/**
 * "Publish hunt" with a confirmation that spells out what players will see,
 * based on the schedule. The server refuses hunts without tasks.
 */
export function PublishButton({
  huntId,
  huntName,
  consequence,
  variant = "primary",
  size = "md",
}: {
  huntId: string;
  huntName: string;
  /** One or two sentences: what happens the moment it's published. */
  consequence: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <ConfirmAction
      action={publishHuntAction}
      fields={{ huntId }}
      label="Publish hunt"
      icon={<Rocket aria-hidden />}
      variant={variant}
      size={size}
      title={`Publish “${huntName}”?`}
      description={consequence}
      confirmLabel="Publish hunt"
      confirmVariant="primary"
    >
      <p className="text-sm text-ink-2">
        You can switch it back to a draft from Settings. Teams and submissions are kept either way.
      </p>
    </ConfirmAction>
  );
}
