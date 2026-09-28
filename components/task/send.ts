import { requestBackgroundSync } from "@/lib/offline/background-sync";
import { buildSubmissionForm, enqueueSubmission, type NewQueuedSubmission } from "@/lib/offline/queue";

/*
 * Sending a submission from the task page: XMLHttpRequest for upload
 * progress and cancel, falling back to the on-device queue whenever the
 * network (or the server) lets us down. The same clientId travels with the
 * queued copy, so a request that did reach the server is never counted twice.
 */

export type SubmissionReply = {
  ok: true;
  duplicate?: boolean;
  submission: {
    id: string;
    status: "pending" | "approved" | "rejected";
    feedback: string | null;
    points: number | null;
  };
  attemptsLeft: number | null;
  task: { id: string; code: number; title: string };
};

export type SendOutcome =
  | { kind: "done"; reply: SubmissionReply }
  /** The server refused it (4xx): show the message, don't retry as-is. `code`: see SubmitFailureCode. */
  | { kind: "refused"; status: number; error: string; code?: string }
  /** Network trouble, a timeout, 429 or 5xx: worth trying again later. */
  | { kind: "retry"; status: number; error: string | null }
  | { kind: "cancelled" };

export type Progress = { loaded: number; total: number };

const TOO_BIG = "That’s too much to send at once. Send fewer or smaller files.";

/** No upload progress for this long means the connection has stalled. */
const STALL_MS = 45_000;
/** After the upload finishes, how long to wait for the server's answer. */
const REPLY_MS = 120_000;

export function sendSubmission(opts: {
  huntId: string;
  form: FormData;
  onProgress?: (p: Progress) => void;
  /** Every byte is out; the server is checking and storing it. */
  onUploaded?: () => void;
}): { done: Promise<SendOutcome>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  const url = `/api/hunts/${encodeURIComponent(opts.huntId)}/submissions`;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => xhr.abort(), ms);
  };

  const done = new Promise<SendOutcome>((resolve) => {
    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      arm(STALL_MS);
      opts.onProgress?.({ loaded: e.loaded, total: e.lengthComputable ? e.total : 0 });
    };
    xhr.upload.onload = () => {
      arm(REPLY_MS);
      opts.onUploaded?.();
    };
    xhr.onload = () => {
      clearTimeout(timer);
      const status = xhr.status;
      let body: { ok?: boolean; error?: unknown; code?: unknown } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      const error = typeof body?.error === "string" && body.error ? body.error : null;
      // A reply from somewhere else (a Wi-Fi login page, a proxy) isn't a verdict on the upload.
      const fromUs = !!xhr.responseURL && new URL(xhr.responseURL).pathname === url;
      if (fromUs && status >= 200 && status < 300 && body?.ok === true) {
        resolve({ kind: "done", reply: body as SubmissionReply });
      } else if (
        fromUs &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429 &&
        body?.ok === false &&
        error
      ) {
        resolve({ kind: "refused", status, error, ...(typeof body.code === "string" ? { code: body.code } : {}) });
      } else if (status === 413) {
        // Too big for the server, or a proxy in front of it: retrying won't help.
        resolve({ kind: "refused", status, error: error ?? TOO_BIG });
      } else {
        // 408, 429, 5xx, or someone else answering: worth trying again later.
        resolve({ kind: "retry", status, error });
      }
    };
    xhr.onerror = () => {
      clearTimeout(timer);
      resolve({ kind: "retry", status: 0, error: null });
    };
    xhr.onabort = () => {
      clearTimeout(timer);
      resolve(cancelled ? { kind: "cancelled" } : { kind: "retry", status: 0, error: null });
    };
    arm(STALL_MS);
    xhr.send(opts.form);
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      xhr.abort();
    },
  };
}

/** Whether the browser thinks there's no network at all. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Saves the submission on this phone and asks the service worker to send it
 * when the connection is back. Throws with a player-facing message if the
 * browser can't store it.
 */
export async function saveForLater(item: NewQueuedSubmission): Promise<void> {
  try {
    await enqueueSubmission(item);
  } catch (err) {
    const quota = err instanceof DOMException && err.name === "QuotaExceededError";
    throw new Error(
      quota
        ? "This phone is out of storage for saving uploads. Free up some space, or try again when you have signal."
        : "This browser couldn’t save the upload for later. Try again when you have signal.",
    );
  }
  void requestBackgroundSync();
}

export { buildSubmissionForm };
