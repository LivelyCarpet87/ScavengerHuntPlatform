"use client";

import { ImagePlus, Trash } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import { formatBytes } from "@/lib/format";
import { removeCoverAction, uploadCoverAction } from "@/lib/staff/hunt-actions";
import { ConfirmAction } from "../confirm-action";
import { useActionForm } from "../use-action-form";

const MAX_BYTES = 8 * 1024 * 1024;

/** The hunt's cover photo: shown at the top of the hunt page. */
export function CoverForm({ huntId, coverUrl }: { huntId: string; coverUrl: string | null }) {
  const inputId = useId();
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, pending, onSubmit, formRef } = useActionForm(uploadCoverAction, {
    resetOnSuccess: true,
    onSuccess: () => {
      setPicked(null);
      setPreview(null);
    },
  });
  const shown = preview ?? coverUrl;

  // A local preview holds the picked file in memory until its URL is revoked.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">Cover photo</p>
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative aspect-[16/9] w-full max-w-72 overflow-hidden rounded-lg border border-line bg-mist">
          {shown ? (
            // biome-ignore lint/performance/noImgElement: access-checked upload or a local preview
            <img src={shown} alt="Current hunt cover" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center px-4 text-center text-sm text-ink-3">No cover yet</span>
          )}
        </div>
        <form
          ref={formRef}
          onSubmit={(e) => {
            if (!picked) {
              e.preventDefault();
              setLocalError("Choose a photo first.");
              return;
            }
            if (picked.size > MAX_BYTES) {
              e.preventDefault();
              setLocalError(`That photo is ${formatBytes(picked.size)}. The limit is 8 MB.`);
              return;
            }
            setLocalError(null);
            onSubmit(e);
          }}
          className="flex min-w-0 flex-1 basis-56 flex-col gap-3"
        >
          <input type="hidden" name="huntId" value={huntId} />
          <p className="text-sm text-ink-2">A wide photo of the place works best. JPEG, PNG or WebP up to 8 MB.</p>
          <div className="flex flex-wrap gap-2">
            {/* The input sits inside its label, so keyboard focus on it outlines the visible button. */}
            <label
              htmlFor={inputId}
              className="relative inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-paper px-4 text-[0.9375rem] font-semibold shadow-[inset_0_0_0_2px_var(--ink)] hover:bg-mist has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-overprint"
            >
              <input
                id={inputId}
                type="file"
                name="cover"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setPicked(file);
                  setLocalError(null);
                  setPreview(file ? URL.createObjectURL(file) : null);
                }}
              />
              <ImagePlus aria-hidden className="size-4" />
              {coverUrl || picked ? "Choose another photo" : "Choose a photo"}
            </label>
            {picked ? (
              <Button type="submit" pending={pending}>
                Upload cover
              </Button>
            ) : null}
          </div>
          {localError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {localError}
            </p>
          ) : (
            <FormMessage state={state} />
          )}
        </form>
      </div>
      {coverUrl && !picked ? (
        <ConfirmAction
          action={removeCoverAction}
          fields={{ huntId }}
          label="Remove cover"
          icon={<Trash aria-hidden />}
          variant="ghost"
          size="sm"
          className="self-start text-danger"
          title="Remove the cover photo?"
          description="Players will see the hunt page without a cover photo."
          confirmLabel="Remove cover"
        />
      ) : null}
    </div>
  );
}
