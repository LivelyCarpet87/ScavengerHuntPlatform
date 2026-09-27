"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { FormMessage } from "@/components/ui/form";
import { updateVisibilityAction } from "@/lib/staff/hunt-actions";
import { useActionForm } from "../use-action-form";

const SCOREBOARD = {
  public: "Anyone with the hunt’s link can see the standings, not just players.",
  players: "Players who joined the hunt can see the standings.",
  staff: "Only staff can open the scoreboard. Keep the suspense for the prize-giving.",
} as const;

const GALLERY = {
  off: "No shared gallery: each team only sees its own photos.",
  after: "When the hunt ends, accepted photos become a shared album for everyone who played.",
  live: "Accepted photos appear for everyone as they come in, so teams can see what others found.",
} as const;

/** Who sees the scoreboard, and when the photo gallery opens. */
export function VisibilityForm({
  huntId,
  values,
}: {
  huntId: string;
  values: { scoreboardVisibility: keyof typeof SCOREBOARD; galleryMode: keyof typeof GALLERY };
}) {
  const { state, pending, onSubmit, formRef } = useActionForm(updateVisibilityAction);
  const [board, setBoard] = useState(values.scoreboardVisibility);
  const [gallery, setGallery] = useState(values.galleryMode);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="huntId" value={huntId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Scoreboard</legend>
        <Segmented
          name="scoreboardVisibility"
          defaultValue={values.scoreboardVisibility}
          onChange={(v) => setBoard(v as keyof typeof SCOREBOARD)}
          className="self-start"
          options={[
            { value: "public", label: "Everyone" },
            { value: "players", label: "Players" },
            { value: "staff", label: "Staff only" },
          ]}
        />
        <p className="text-sm text-ink-2" aria-live="polite">
          {SCOREBOARD[board]}
        </p>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Photo gallery</legend>
        <Segmented
          name="galleryMode"
          defaultValue={values.galleryMode}
          onChange={(v) => setGallery(v as keyof typeof GALLERY)}
          className="self-start"
          options={[
            { value: "off", label: "Off" },
            { value: "after", label: "After the hunt" },
            { value: "live", label: "Live" },
          ]}
        />
        <p className="text-sm text-ink-2" aria-live="polite">
          {GALLERY[gallery]}
        </p>
      </fieldset>
      <FormMessage state={state} />
      <Button type="submit" variant="secondary" pending={pending} className="self-start">
        Save visibility
      </Button>
    </form>
  );
}
