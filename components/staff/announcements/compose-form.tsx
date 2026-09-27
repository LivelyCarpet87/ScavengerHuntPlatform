"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { createAnnouncementAction } from "@/lib/staff/announcement-actions";
import { formLevel } from "@/lib/staff/forms";
import { MarkdownField } from "../markdown-field";
import { useActionForm } from "../use-action-form";

/** Write an announcement and send it to every player (in the app, and as a push notification). */
export function ComposeAnnouncement({ huntId, reachNote }: { huntId: string; reachNote: string }) {
  const { state, pending, onSubmit, formRef } = useActionForm(createAnnouncementAction, {
    resetOnSuccess: true,
    onSuccess: (s) => {
      if (s?.ok) toast({ title: s.message ?? "Sent to all players.", tone: "success" });
    },
  });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" name="huntId" value={huntId} />
      <Field
        label="Title"
        hint="Optional. Shown in bold and as the notification title."
        error={fieldError(state, "title")}
      >
        {(p) => <Input {...p} name="title" maxLength={80} placeholder="Clock tower opens soon" autoComplete="off" />}
      </Field>
      <MarkdownField
        name="body"
        label="Message"
        rows={5}
        maxLength={2000}
        placeholder="Control 41 unlocks in 25 minutes: a new checkpoint worth 70 points."
        error={fieldError(state, "body")}
        emptyPreview="Write a message to preview it."
      />
      <Switch
        name="pinned"
        label="Pin to the top"
        hint="Pinned announcements stay above the rest in players’ Updates, e.g. the finish location."
      />
      {state && !state.ok ? <FormMessage state={formLevel(state, ["title", "body"])} /> : null}
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" pending={pending} className="self-start">
          {pending ? null : <Send aria-hidden />}
          {pending ? "Sending" : "Send to all players"}
        </Button>
        <p className="text-sm text-ink-2">{reachNote}</p>
      </div>
    </form>
  );
}
