"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { newClientId } from "@/lib/offline/client-id";
import type { QueuedFile } from "@/lib/offline/queue";
import { expectInlineResult } from "./inline-results";
import { buildSubmissionForm, isOffline, type SubmissionReply, saveForLater, sendSubmission } from "./send";

export type SubmitPhase =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "uploading"; loaded: number; total: number }
  | { kind: "processing" };

export type SubmitPayload = {
  text?: string | null;
  files?: QueuedFile[];
  poster?: QueuedFile | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  /** Shown in the waiting-uploads list if it has to be saved for later. */
  label: string;
  /** Rate-limited guesses (429) are shown, not queued; uploads are queued. */
  queueWhenBusy: boolean;
};

export type SubmitOutcome =
  | { kind: "done"; reply: SubmissionReply }
  /** `code`: the server's SubmitFailureCode, e.g. "already_completed". */
  | { kind: "refused"; status: number; error: string; code?: string }
  | { kind: "queued" }
  | { kind: "cancelled" };

/**
 * One submission at a time for a task: sends with progress, lets the player
 * cancel, and saves to the on-device queue when the network fails. `teamId`
 * is the player's team: proof made for it is never counted for another.
 */
export function useSubmitter(huntId: string, taskId: string, teamId: string) {
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);
  const mounted = useRef(true);

  // An upload keeps going when the form goes away (the player opened another
  // tab, or a live refresh swapped the form for "Waiting for a judge"): the
  // result still arrives, and a failure still lands in the queue. Only a
  // refusal needs saying out loud, since the form that would show it is gone.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setPreparing = useCallback(() => setPhase({ kind: "preparing" }), []);

  const submit = useCallback(
    async (payload: SubmitPayload): Promise<SubmitOutcome> => {
      const files = payload.files ?? [];
      const item = {
        clientId: newClientId(),
        huntId,
        taskId,
        teamId,
        text: payload.text?.trim() || null,
        files,
        poster: payload.poster ?? null,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        accuracy: payload.accuracy ?? null,
        label: payload.label,
      };
      // Every ending goes through here: back to idle, and a refusal the form can no longer show becomes a toast.
      const finish = (outcome: SubmitOutcome): SubmitOutcome => {
        setPhase({ kind: "idle" });
        if (outcome.kind === "refused" && !mounted.current) {
          toast({ title: "Couldn’t send an upload", description: `${item.label}: ${outcome.error}`, tone: "danger" });
        }
        return outcome;
      };
      const queue = async (): Promise<SubmitOutcome> => {
        try {
          await saveForLater(item);
          return finish({ kind: "queued" });
        } catch (err) {
          return finish({ kind: "refused", status: 0, error: (err as Error).message });
        }
      };

      if (isOffline()) return queue();

      // The answer shows up right here; spare this phone the matching live toast.
      expectInlineResult(taskId);
      const total = files.reduce((n, f) => n + f.blob.size, 0) + (item.poster?.blob.size ?? 0);
      setPhase(files.length > 0 ? { kind: "uploading", loaded: 0, total } : { kind: "processing" });
      const { done, cancel } = sendSubmission({
        huntId,
        form: buildSubmissionForm(item),
        onProgress: (p) => setPhase({ kind: "uploading", loaded: p.loaded, total: p.total || total }),
        onUploaded: () => setPhase({ kind: "processing" }),
      });
      cancelRef.current = cancel;
      const outcome = await done;
      cancelRef.current = null;

      switch (outcome.kind) {
        case "done":
          // The live event can trail the response by a moment.
          expectInlineResult(taskId, 8000);
          return finish(outcome);
        case "refused":
        case "cancelled":
          return finish(outcome);
        case "retry":
          if (outcome.status === 429 && !payload.queueWhenBusy) {
            return finish({
              kind: "refused",
              status: 429,
              error: outcome.error ?? "That’s a lot of tries in a short time. Wait a minute and try again.",
            });
          }
          return queue();
      }
    },
    [huntId, taskId, teamId],
  );

  const cancel = useCallback(() => cancelRef.current?.(), []);
  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  return { phase, submit, cancel, setPreparing, reset, busy: phase.kind !== "idle" };
}
