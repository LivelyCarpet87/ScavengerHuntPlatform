"use client";

import { Camera, CircleCheck, Images, Plus, Video, X } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/format";
import type { QueuedFile } from "@/lib/offline/queue";
import { cn } from "@/lib/utils";
import { ActionBar } from "./action-bar";
import { type Coords, LocationToggle } from "./location-toggle";
import {
  capturePoster,
  compressImage,
  countMedia,
  describeMedia,
  type MediaKind,
  mediaKindOf,
  type PreparedFile,
} from "./media-prep";
import { PlainImg } from "./plain-img";
import type { SubmissionReply } from "./send";
import type { ActionTask } from "./task-types";
import { UploadProgress } from "./upload-progress";
import { useSubmitter } from "./use-submitter";

const MAX_FILES = 4;
const MAX_NOTE = 2000;

type Item = {
  key: string;
  file: File;
  kind: MediaKind;
  /** Object URL shown in the tile: the photo itself, or a video's poster frame. */
  preview: string | null;
  /** The preview couldn't be decoded (e.g. HEIC in Chrome before conversion). */
  broken: boolean;
  prepared: Promise<PreparedFile>;
  poster: Promise<Blob | null> | null;
};

/** A limit in whole megabytes: "100 MB". */
function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Photo/video proof (media tasks) and contest entries: pick or take up to
 * four files, add a note and optionally the location, and upload with
 * progress. Photos are shrunk on the phone first; videos get a poster frame.
 */
export function MediaForm({
  huntId,
  task,
  accept,
  maxUploadBytes,
  onDone,
  onQueued,
}: {
  huntId: string;
  task: ActionTask;
  /** <input accept> for the library picker (acceptAttr). */
  accept: string;
  maxUploadBytes: number;
  onDone: (reply: SubmissionReply) => void;
  onQueued: () => void;
}) {
  const contest = task.kind === "contest";
  const allowPhoto = task.mediaAccept !== "video";
  const allowVideo = task.mediaAccept !== "photo";
  const wanted = allowPhoto && allowVideo ? "photo or video" : allowVideo ? "video" : "photo";

  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Contest teams stay on the form to send more, so "sent" is confirmed right above the button
  // (a toast would sit on top of the pinned bar on phones).
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { phase, submit, cancel, setPreparing, reset, busy } = useSubmitter(huntId, task.id);

  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const abortPrep = useRef(false);

  // Free every preview when the form goes away.
  useEffect(() => {
    const created = urls.current;
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
      created.clear();
    };
  }, []);

  function objectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }
  function revoke(url: string | null) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }
  function patchItem(key: string, patch: (item: Item) => Partial<Item>) {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch(item) } : item)));
  }

  useEffect(() => {
    if (!sentNote) return;
    const t = setTimeout(() => setSentNote(null), 8000);
    return () => clearTimeout(t);
  }, [sentNote]);

  function addFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setSentNote(null);
    const warnings: string[] = [];
    const added: Item[] = [];
    let room = MAX_FILES - items.length;
    for (const file of Array.from(list)) {
      if (room <= 0) {
        warnings.push(`You can send up to ${MAX_FILES} files at once.`);
        break;
      }
      const kind = mediaKindOf(file);
      if (!kind || (kind === "image" && !allowPhoto) || (kind === "video" && !allowVideo)) {
        warnings.push(`“${file.name || "That file"}” isn't a ${wanted}. This task needs a ${wanted}.`);
        continue;
      }
      if (kind === "video" && file.size > maxUploadBytes) {
        warnings.push(
          `“${file.name || "That video"}” is ${formatBytes(file.size)}. Videos can be up to ${megabytes(maxUploadBytes)}, so record a shorter clip.`,
        );
        continue;
      }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let item: Item;
      if (kind === "image") {
        // One photo at a time: decoding several 12 MP photos at once can run a phone out of memory.
        const prepared = chain.current
          .then(() => compressImage(file))
          .catch((): PreparedFile => ({ blob: file, name: file.name || "photo", type: file.type }));
        chain.current = prepared.catch(() => {});
        item = { key, file, kind, preview: objectUrl(file), broken: false, prepared, poster: null };
        prepared.then((p) => {
          if (p.blob === file) return;
          // Show what will actually be sent (also fixes HEIC previews in browsers that can't show them).
          const next = objectUrl(p.blob);
          setItems((current) => {
            const found = current.find((i) => i.key === key);
            if (!found) {
              revoke(next);
              return current;
            }
            revoke(found.preview);
            return current.map((i) => (i.key === key ? { ...i, preview: next, broken: false } : i));
          });
        });
      } else {
        const poster = capturePoster(file);
        item = {
          key,
          file,
          kind,
          preview: null,
          broken: false,
          prepared: Promise.resolve({ blob: file, name: file.name || "video", type: file.type }),
          poster,
        };
        poster.then((blob) => {
          if (!blob) return;
          const next = objectUrl(blob);
          setItems((current) => {
            if (!current.some((i) => i.key === key)) {
              revoke(next);
              return current;
            }
            return current.map((i) => (i.key === key ? { ...i, preview: next } : i));
          });
        });
      }
      added.push(item);
      room -= 1;
    }
    if (added.length) setItems((current) => [...current, ...added]);
    setWarning(warnings[0] ?? null);
  }

  function removeItem(key: string) {
    const item = items.find((i) => i.key === key);
    if (item) revoke(item.preview);
    setItems((list) => list.filter((i) => i.key !== key));
    setWarning(null);
  }

  function clearAll() {
    for (const item of items) revoke(item.preview);
    setItems([]);
    setNote("");
    setWarning(null);
  }

  const kinds = items.map((i) => i.kind);
  // "your photo", "2 photos", "your entry" — for the progress line.
  const counted = countMedia(kinds);
  const what = contest
    ? "your entry"
    : !items.length
      ? `your ${wanted}`
      : /\d/.test(counted)
        ? counted
        : `your ${counted}`;
  const canSubmit = items.length > 0 || (contest && note.trim().length > 0);
  const submitLabel = contest ? "Submit entry" : `Submit ${items.length ? describeMedia(kinds) : wanted}`;

  async function send() {
    if (!canSubmit || busy) return;
    setError(null);
    abortPrep.current = false;
    setPreparing();
    const prepared = await Promise.all(items.map((i) => i.prepared));
    const firstVideo = items.find((i) => i.kind === "video");
    const posterBlob = firstVideo?.poster ? await firstVideo.poster : null;
    if (abortPrep.current) {
      reset();
      return;
    }
    const files: QueuedFile[] = prepared.map((p) => ({ name: p.name, type: p.type, blob: p.blob }));
    const tooBig = files.find((f) => f.blob.size > maxUploadBytes);
    if (tooBig) {
      reset();
      setError(
        `“${tooBig.name}” is ${formatBytes(tooBig.blob.size)}. Files can be up to ${megabytes(maxUploadBytes)}.`,
      );
      return;
    }
    const label = contest ? `Entry for ${task.title}` : `${upperFirst(countMedia(kinds))} for ${task.title}`;
    const outcome = await submit({
      text: note.slice(0, MAX_NOTE),
      files,
      poster: posterBlob ? { name: "poster.jpg", type: "image/jpeg", blob: posterBlob } : null,
      lat: coords?.lat,
      lng: coords?.lng,
      accuracy: coords?.accuracy,
      label,
      queueWhenBusy: true,
    });
    switch (outcome.kind) {
      case "done": {
        clearAll();
        if (contest) {
          setSentNote("Entry sent. Judges rank entries as they review them.");
        } else if (outcome.reply.submission.status === "pending") {
          toast({
            title: `${upperFirst(describeMedia(kinds) || wanted)} sent`,
            description: `A judge will review ${items.length > 1 ? "them" : "it"} shortly.`,
            tone: "success",
          });
        }
        onDone(outcome.reply);
        break;
      }
      case "queued":
        clearAll();
        onQueued();
        break;
      case "refused":
        setError(outcome.error);
        break;
      case "cancelled":
        setError("Upload cancelled. Your files are still here.");
        break;
    }
  }

  function onCancel() {
    if (phase.kind === "preparing") {
      abortPrep.current = true;
      reset();
      return;
    }
    cancel();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!busy) addFiles(e.dataTransfer.files);
  }

  const pickerIcon = allowPhoto ? <Camera aria-hidden className="size-7" /> : <Video aria-hidden className="size-7" />;

  return (
    <div className="flex flex-col gap-5">
      {/* Hidden pickers: straight to the camera, or the library (which also offers the camera on phones). */}
      <input
        ref={photoInput}
        type="file"
        tabIndex={-1}
        aria-hidden
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInput}
        type="file"
        tabIndex={-1}
        aria-hidden
        accept="video/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        tabIndex={-1}
        aria-hidden
        accept={accept}
        multiple
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag and drop is a desktop extra; the buttons do the same */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn("rounded-lg transition-shadow", dragging && "shadow-[0_0_0_3px_var(--accent)]")}
      >
        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => libraryInput.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong bg-mist px-6 py-8 text-center transition-colors hover:border-ink hover:bg-mist-2"
          >
            <span className="text-ink-2">{pickerIcon}</span>
            <span className="font-semibold">
              {contest ? `Add a ${wanted}` : `Add your ${wanted}`}
              <span className="hidden pointer-fine:inline"> or drop it here</span>
            </span>
            <span className="text-sm text-ink-2">
              {allowPhoto && allowVideo
                ? `Up to ${MAX_FILES} photos or videos. Videos up to ${megabytes(maxUploadBytes)}.`
                : allowVideo
                  ? `Up to ${MAX_FILES} videos, ${megabytes(maxUploadBytes)} each.`
                  : `Up to ${MAX_FILES} photos.`}
              {contest ? " Or just write your entry below." : null}
            </span>
          </button>
        ) : (
          <ul className="grid grid-cols-4 gap-2" aria-label="Files to send">
            {items.map((item, i) => (
              <li key={item.key} className="relative aspect-square overflow-hidden rounded-md bg-mist">
                {item.preview && !item.broken ? (
                  <PlainImg
                    src={item.preview}
                    alt={`${item.kind === "video" ? "Video" : "Photo"} ${i + 1}`}
                    className="size-full object-cover"
                    onError={() => patchItem(item.key, () => ({ broken: true }))}
                  />
                ) : (
                  <span className="grid size-full place-items-center text-ink-2">
                    {item.kind === "video" ? (
                      <Video aria-hidden className="size-6" />
                    ) : (
                      <Camera aria-hidden className="size-6" />
                    )}
                    <span className="sr-only">{item.file.name}</span>
                  </span>
                )}
                {item.kind === "video" ? (
                  <span className="absolute bottom-1 left-1 grid size-6 place-items-center rounded-sm bg-ink/70 text-paper">
                    <Video aria-hidden className="size-3.5" />
                    <span className="sr-only">Video</span>
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  disabled={busy}
                  aria-label={`Remove ${item.kind === "video" ? "video" : "photo"} ${i + 1}`}
                  className="absolute top-0 right-0 grid size-11 place-items-start justify-items-end p-1.5 disabled:hidden"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-paper/90 text-ink ring-1 ring-line">
                    <X aria-hidden className="size-4" />
                  </span>
                </button>
              </li>
            ))}
            {items.length < MAX_FILES && !busy ? (
              <li>
                <button
                  type="button"
                  onClick={() => libraryInput.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line-strong text-sm font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink"
                >
                  <Plus aria-hidden className="size-5" />
                  Add
                </button>
              </li>
            ) : null}
          </ul>
        )}
        {warning ? (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {warning}
          </p>
        ) : null}
      </div>

      <Field
        label={contest ? "Write your entry" : "Note for the judges"}
        hint={contest ? `Optional if you add a ${wanted}.` : "Optional."}
      >
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            maxLength={MAX_NOTE}
            value={note}
            disabled={busy}
            onChange={(e) => {
              setNote(e.target.value);
              setSentNote(null);
            }}
            className="min-h-20"
          />
        )}
      </Field>

      <LocationToggle onChange={setCoords} disabled={busy} />

      <ActionBar>
        {error ? (
          <p role="alert" className="mb-2 text-sm font-medium text-danger">
            {error}
          </p>
        ) : sentNote ? (
          <output className="mb-2 flex items-center gap-2 text-sm font-semibold text-forest">
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            {sentNote}
          </output>
        ) : null}
        {busy ? (
          <UploadProgress phase={phase} what={what} onCancel={onCancel} />
        ) : canSubmit ? (
          <Button size="lg" className="w-full md:w-auto md:min-w-64" onClick={send}>
            {submitLabel}
          </Button>
        ) : (
          <div className="flex gap-2">
            {/* Phones: straight to the camera. */}
            <Button
              size="lg"
              className="flex-1 pointer-fine:hidden md:flex-none md:min-w-56"
              onClick={() => (allowPhoto ? photoInput : videoInput).current?.click()}
            >
              {allowPhoto ? <Camera aria-hidden /> : <Video aria-hidden />}
              {allowPhoto ? "Take photo" : "Record video"}
            </Button>
            {allowPhoto && allowVideo ? (
              <button
                type="button"
                onClick={() => videoInput.current?.click()}
                className={cn(
                  buttonClass("secondary", "lg"),
                  "w-16 flex-col gap-0.5 px-0 text-xs pointer-fine:hidden [&_svg]:size-5",
                )}
              >
                <Video aria-hidden />
                Video
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => libraryInput.current?.click()}
              aria-label="Choose from library"
              className={cn(
                buttonClass("secondary", "lg"),
                "w-16 flex-col gap-0.5 px-0 text-xs pointer-fine:hidden [&_svg]:size-5",
              )}
            >
              <Images aria-hidden />
              Library
            </button>
            {/* Laptops: a file picker. */}
            <Button
              size="lg"
              className="hidden flex-1 pointer-fine:inline-flex md:flex-none md:min-w-64"
              onClick={() => libraryInput.current?.click()}
            >
              <Images aria-hidden />
              Choose {wanted}
            </Button>
          </div>
        )}
      </ActionBar>
    </div>
  );
}
