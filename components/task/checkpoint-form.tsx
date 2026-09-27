"use client";

import { Keyboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { parseCheckpointInput } from "@/components/scan/checkpoint-link";
import { QrScanButton } from "@/components/scan/qr-scanner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ActionBar } from "./action-bar";
import type { SubmissionReply } from "./send";
import type { ActionTask } from "./task-types";
import { useSubmitter } from "./use-submitter";

/** Checkpoints: scan the poster's QR code, or type the code printed under it. */
export function CheckpointForm({
  huntId,
  slug,
  task,
  onDone,
  onQueued,
}: {
  huntId: string;
  slug: string;
  task: ActionTask;
  onDone: (reply: SubmissionReply) => void;
  onQueued: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { submit, busy } = useSubmitter(huntId, task.id);
  const router = useRouter();

  /** `fromPoster`: the code came from scanning one of this hunt's poster links. */
  async function punch(value: string, fromPoster = false) {
    setError(null);
    const outcome = await submit({ text: value, label: `Code for ${task.title}`, queueWhenBusy: false });
    switch (outcome.kind) {
      case "done":
        setCode("");
        onDone(outcome.reply);
        break;
      case "queued":
        setCode("");
        onQueued();
        break;
      case "refused":
        // A real poster of this hunt, just not this checkpoint's: punch the one it belongs to.
        if (fromPoster && outcome.status === 422) router.push(`/h/${slug}/cp/${encodeURIComponent(value)}`);
        else setError(outcome.error);
        break;
      case "cancelled":
        break;
    }
  }

  /** Scanner callback: close on anything that looks like a checkpoint of this hunt, keep scanning otherwise. */
  function onScan(text: string): boolean {
    const parsed = parseCheckpointInput(text);
    if (!parsed || (parsed.slug && parsed.slug !== slug)) return false;
    void punch(parsed.code, parsed.slug === slug);
    return true;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseCheckpointInput(code);
    if (!parsed) {
      setError("Type the code printed under the QR code.");
      inputRef.current?.focus();
      return;
    }
    void punch(parsed.code);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">
        Find the poster at this checkpoint and scan its QR code. Scanning it with your phone’s camera app works too.
      </p>
      {typing ? (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <Field label="Code on the poster" error={error}>
            {(p) => (
              <Input
                {...p}
                ref={inputRef}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                maxLength={40}
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                disabled={busy}
                className="h-14 font-bib text-2xl tracking-[0.12em]"
              />
            )}
          </Field>
          <Button type="submit" size="lg" variant="secondary" pending={busy} className="w-full sm:w-auto sm:self-start">
            Check code
          </Button>
        </form>
      ) : (
        <>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button variant="quiet" onClick={() => setTyping(true)} className="self-start">
            <Keyboard aria-hidden />
            Type the code instead
          </Button>
        </>
      )}
      <ActionBar>
        {busy ? (
          <p className="flex h-14 items-center justify-center gap-2 font-semibold" aria-live="polite">
            <Spinner className="size-5 text-accent" />
            Checking the code
          </p>
        ) : (
          <QrScanButton
            onResult={onScan}
            onTypeInstead={() => {
              setTyping(true);
              // After the sheet has closed and handed focus back.
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            label="Scan the checkpoint"
            variant="primary"
            size="lg"
            className="w-full md:w-auto md:min-w-64"
          />
        )}
      </ActionBar>
    </div>
  );
}
