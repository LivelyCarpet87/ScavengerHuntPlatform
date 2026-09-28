"use client";

import { Keyboard, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { parseCheckpointInput } from "@/components/scan/checkpoint-link";
import { QrScanButton } from "@/components/scan/qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ActionBar } from "./action-bar";
import type { SubmissionReply } from "./send";
import type { ActionTask } from "./task-types";
import { useSubmitter } from "./use-submitter";

/**
 * Checkpoints: scan the poster's QR code, or type the code printed under it.
 * Whichever the team is using sits in the pinned action bar on phones, with
 * any problem right above it (announced, and never behind the bar). Focus
 * stays on the control that was used while the code is checked, and returns
 * to the field after a wrong code.
 */
export function CheckpointForm({
  huntId,
  slug,
  teamId,
  task,
  onDone,
  onQueued,
}: {
  huntId: string;
  slug: string;
  teamId: string;
  task: ActionTask;
  onDone: (reply: SubmissionReply) => void;
  onQueued: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { submit, busy } = useSubmitter(huntId, task.id, teamId);
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
        if (fromPoster && outcome.status === 422) {
          router.push(`/h/${slug}/cp/${encodeURIComponent(value)}`);
          break;
        }
        setError(outcome.error);
        // Straight back to the code, ready to fix it.
        if (!fromPoster) requestAnimationFrame(() => inputRef.current?.select());
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
    if (busy) return;
    const parsed = parseCheckpointInput(code);
    if (!parsed) {
      setError("Type the code printed under the QR code.");
      inputRef.current?.focus();
      return;
    }
    void punch(parsed.code);
  }

  function startTyping() {
    setError(null);
    setTyping(true);
    // Once the field has rendered.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const problem = error ? (
    <p id={`${id}-error`} role="alert" className="mb-2 text-sm font-medium text-danger">
      {error}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <output aria-live="polite" className="sr-only">
        {busy ? "Checking the code" : ""}
      </output>
      <p className="text-ink-2">
        Find the poster at this checkpoint and scan its QR code. Scanning it with your phone’s camera app works too.
      </p>
      {typing ? (
        <Button
          variant="quiet"
          className="self-start"
          onClick={() => {
            setError(null);
            setTyping(false);
            setTimeout(() => scanRef.current?.focus(), 0);
          }}
        >
          <ScanLine aria-hidden />
          Scan the QR code instead
        </Button>
      ) : (
        <Button variant="quiet" onClick={startTyping} className="self-start">
          <Keyboard aria-hidden />
          Type the code instead
        </Button>
      )}
      {typing ? (
        <form onSubmit={onSubmit} noValidate>
          <ActionBar>
            <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
              Code on the poster
            </label>
            {problem}
            <div className="flex gap-2">
              <Input
                id={id}
                ref={inputRef}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                // Stays focusable (unlike disabled) while the code is checked, so focus isn't lost.
                readOnly={busy}
                aria-busy={busy || undefined}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                className="h-14 min-w-0 flex-1 font-bib text-2xl tracking-[0.12em]"
              />
              <Button type="submit" size="lg" pending={busy} className="px-5">
                Check code
              </Button>
            </div>
          </ActionBar>
        </form>
      ) : (
        <ActionBar>
          {problem}
          <QrScanButton
            buttonRef={scanRef}
            onResult={onScan}
            onTypeInstead={startTyping}
            pending={busy}
            pendingLabel="Checking the code"
            label="Scan the checkpoint"
            variant="primary"
            size="lg"
            className="w-full md:w-auto md:min-w-64"
          />
        </ActionBar>
      )}
    </div>
  );
}
