"use client";

import { FileText, Paperclip, Trash, Upload } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { formatBytes } from "@/lib/format";
import { deleteAttachmentAction, uploadAttachmentAction } from "@/lib/staff/task-actions";
import { ConfirmAction } from "../confirm-action";
import { useActionForm } from "../use-action-form";

export type AttachmentData = {
  id: string;
  name: string;
  size: number;
  isImage: boolean;
  thumbUrl: string;
  url: string;
};

const MAX_BYTES = 10 * 1024 * 1024;

/** Photos and PDFs players can open from the task (a map, a clue sheet…). `readOnly` lists them only. */
export function AttachmentsEditor({
  huntId,
  taskId,
  files,
  readOnly = false,
}: {
  huntId: string;
  taskId: string;
  files: AttachmentData[];
  readOnly?: boolean;
}) {
  const inputId = useId();
  const [picked, setPicked] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, pending, onSubmit, formRef } = useActionForm(uploadAttachmentAction, {
    resetOnSuccess: true,
    onSuccess: () => setPicked(null),
  });

  return (
    <section id="attachments" aria-labelledby="attachments-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="attachments-heading" className="font-cond text-2xl font-bold">
          Attachments
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {readOnly
            ? "Photos or PDFs players can open from the task, like a map or a clue sheet."
            : "Photos or PDFs players can open from the task, like a map or a clue sheet. Up to 8, 10 MB each."}
        </p>
      </div>
      {readOnly && files.length === 0 ? <p className="text-sm text-ink-2">This task has no attachments.</p> : null}

      {files.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              {f.isImage ? (
                // biome-ignore lint/performance/noImgElement: access-checked upload, served by /files
                <img src={f.thumbUrl} alt="" className="size-12 shrink-0 rounded-sm bg-mist object-cover" />
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-mist text-ink-2">
                  <FileText aria-hidden className="size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate font-semibold hover:underline"
                >
                  {f.name}
                </a>
                <p className="text-sm text-ink-2">{formatBytes(f.size)}</p>
              </div>
              {readOnly ? null : (
                <ConfirmAction
                  action={deleteAttachmentAction}
                  fields={{ huntId, fileId: f.id }}
                  label={<span className="sr-only">Delete {f.name}</span>}
                  icon={<Trash aria-hidden />}
                  variant="ghost"
                  size="icon"
                  className="text-danger"
                  title="Delete this attachment?"
                  description={`Players will no longer see “${f.name}” on the task.`}
                  confirmLabel="Delete attachment"
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {readOnly ? null : (
        <form
          ref={formRef}
          onSubmit={(e) => {
            if (!picked) {
              e.preventDefault();
              setLocalError("Choose a photo or a PDF first.");
              return;
            }
            if (picked.size > MAX_BYTES) {
              e.preventDefault();
              setLocalError(`“${picked.name}” is ${formatBytes(picked.size)}. The limit is 10 MB.`);
              return;
            }
            setLocalError(null);
            onSubmit(e);
          }}
          className="flex flex-col gap-3 rounded-lg bg-mist p-4"
        >
          <input type="hidden" name="huntId" value={huntId} />
          <input type="hidden" name="taskId" value={taskId} />
          <div className="flex flex-wrap items-center gap-3">
            {/* The input sits inside its label, so keyboard focus on it outlines the visible button. */}
            <label
              htmlFor={inputId}
              className="relative inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-paper px-4 text-[0.9375rem] font-semibold shadow-[inset_0_0_0_2px_var(--ink)] hover:bg-mist-2 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-overprint"
            >
              <input
                id={inputId}
                type="file"
                name="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  setPicked(e.target.files?.[0] ?? null);
                  setLocalError(null);
                }}
              />
              <Paperclip aria-hidden className="size-4" />
              {picked ? "Choose another file" : "Choose a photo or PDF"}
            </label>
            {picked ? (
              <span className="min-w-0 truncate text-sm text-ink-2">
                {picked.name} <span className="text-ink-3">({formatBytes(picked.size)})</span>
              </span>
            ) : null}
          </div>
          {picked ? (
            <Button type="submit" pending={pending} className="self-start">
              <Upload aria-hidden />
              Upload attachment
            </Button>
          ) : null}
          {localError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {localError}
            </p>
          ) : (
            <FormMessage state={state} />
          )}
        </form>
      )}
    </section>
  );
}
