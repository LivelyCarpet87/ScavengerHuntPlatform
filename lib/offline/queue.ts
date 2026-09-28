/*
 * Offline upload queue.
 *
 * When a phone loses signal mid-hunt, submissions are saved here (IndexedDB,
 * files stored as Blobs) and sent later with the same clientId, so the server
 * never records one twice. Runs in pages AND in the service worker: only
 * IndexedDB, fetch, BroadcastChannel and Web Locks — no DOM, no React, no
 * server imports.
 *
 * Who flushes:
 *   - pages: components/task/queue-flusher.tsx (on load, when back online,
 *     when the app returns to the foreground, every minute while items wait)
 *   - the service worker, on Background Sync with tag QUEUE_SYNC_TAG:
 *       self.addEventListener("sync", (e) => {
 *         if (e.tag === QUEUE_SYNC_TAG)
 *           e.waitUntil(flushQueue().then((r) => { if (r.remaining > 0) throw new Error("retry later"); }));
 *       });
 *     Only one context sends at a time (a Web Lock). A page that finds another
 *     one sending leaves it to them; the service worker waits its turn instead,
 *     so a sync event only fails when something is really still waiting.
 *
 * Each item remembers the team it was made for and when, so the server can
 * refuse it for a different team and still accept it shortly after the task
 * closed if it was made while open (see LATE_GRACE_MS in lib/player/submit.ts).
 *
 * Every change is announced on BroadcastChannel("shp-queue"), so all tabs and
 * the service worker stay in step (see onQueueChange / onQueueEvent).
 */

/** Background Sync tag the service worker listens for. */
export const QUEUE_SYNC_TAG = "shp-submissions";

export type QueuedFile = { name: string; type: string; blob: Blob };

export type QueuedSubmission = {
  /** Idempotency key sent to the server; also the IndexedDB key. */
  clientId: string;
  huntId: string;
  taskId: string;
  /** The team it was made for; the server refuses it once the phone is on another team. */
  teamId?: string | null;
  text?: string | null;
  files: QueuedFile[];
  poster?: QueuedFile | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  createdAt: number;
  attempts: number;
  state: "queued" | "sending" | "failed";
  /** Last non-retryable error message (state "failed"). */
  error?: string | null;
  /** The server's code for that refusal, if it gave one (e.g. "team_changed", which no retry fixes). */
  errorCode?: string | null;
  /** What it is, for the waiting-uploads list, e.g. "2 photos for The red door". */
  label?: string | null;
  /** When the last send attempt ended (ms). */
  lastAttemptAt?: number | null;
};

export type NewQueuedSubmission = Omit<QueuedSubmission, "attempts" | "state" | "error" | "errorCode" | "createdAt">;

/** What the server said about a queued submission once it was accepted. */
export type SentResult = {
  status: "pending" | "approved" | "rejected";
  feedback: string | null;
  points: number | null;
};

export type QueueEvent =
  | { type: "changed" }
  | {
      type: "sent";
      clientId: string;
      huntId: string;
      taskId: string;
      label: string | null;
      result: SentResult | null;
    }
  /** Nothing left to send: the team already has the task (a teammate got there first). The item is gone. */
  | { type: "already"; clientId: string; huntId: string; taskId: string; label: string | null }
  | { type: "failed"; clientId: string; huntId: string; taskId: string; label: string | null; error: string };

const DB_NAME = "shp-offline";
const DB_VERSION = 1;
const STORE = "submissions";
const CHANNEL = "shp-queue";
const LOCK = "shp-queue-flush";

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser can’t save uploads for later."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientId" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let a newer version of the app upgrade the database.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("Couldn’t open the upload queue."));
  });
  dbPromise = opening;
  opening.catch(() => {
    if (dbPromise === opening) dbPromise = null;
  });
  return opening;
}

/** Runs one request in a transaction and resolves with its result once the transaction commits. */
async function inStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let request: IDBRequest<T> | undefined;
    try {
      request = run(tx.objectStore(STORE));
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error ?? request?.error ?? new Error("Upload queue error"));
    tx.onabort = () => reject(tx.error ?? new Error("Upload queue transaction aborted"));
  });
}

async function updateItem(clientId: string, patch: Partial<QueuedSubmission>): Promise<QueuedSubmission | null> {
  const db = await openDb();
  return new Promise<QueuedSubmission | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let next: QueuedSubmission | null = null;
    const get = store.get(clientId) as IDBRequest<QueuedSubmission | undefined>;
    get.onsuccess = () => {
      if (!get.result) return;
      next = { ...get.result, ...patch, clientId };
      store.put(next);
    };
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(tx.error ?? new Error("Upload queue error"));
    tx.onabort = () => reject(tx.error ?? new Error("Upload queue transaction aborted"));
  });
}

// ---------------------------------------------------------------------------
// Change notifications
// ---------------------------------------------------------------------------

let sender: BroadcastChannel | null = null;
const localListeners = new Set<(event: QueueEvent) => void>();

function emit(event: QueueEvent) {
  if (typeof BroadcastChannel !== "undefined") {
    try {
      sender ??= new BroadcastChannel(CHANNEL);
      // Delivered to every other channel object with this name, including
      // listeners in this same page or worker.
      sender.postMessage(event);
      return;
    } catch {
      // Fall through to same-context listeners.
    }
  }
  for (const listener of localListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[queue] listener failed", err);
    }
  }
}

/** Detailed queue events (sent, failed, changed) from any tab or the service worker. */
export function onQueueEvent(cb: (event: QueueEvent) => void): () => void {
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (message: MessageEvent<QueueEvent>) => cb(message.data);
      return () => channel.close();
    } catch {
      // Fall back to same-context listeners below.
    }
  }
  localListeners.add(cb);
  return () => {
    localListeners.delete(cb);
  };
}

/** Subscribe to queue changes from any tab or the service worker. Returns an unsubscribe function. */
export function onQueueChange(cb: () => void): () => void {
  return onQueueEvent(() => cb());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Saves a submission on the device to send later. */
export async function enqueueSubmission(item: NewQueuedSubmission): Promise<void> {
  const record: QueuedSubmission = {
    ...item,
    createdAt: Date.now(),
    attempts: 0,
    state: "queued",
    error: null,
    errorCode: null,
    lastAttemptAt: null,
  };
  await inStore("readwrite", (store) => store.put(record));
  emit({ type: "changed" });
}

/** Queued submissions, optionally for one hunt, oldest first. */
export async function listQueued(huntId?: string): Promise<QueuedSubmission[]> {
  const all =
    (await inStore<QueuedSubmission[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedSubmission[]>)) ?? [];
  return all.filter((item) => !huntId || item.huntId === huntId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueued(clientId: string): Promise<void> {
  await inStore("readwrite", (store) => store.delete(clientId));
  emit({ type: "changed" });
}

/** Puts a failed submission back in line (after the player fixed the problem or wants another go). */
export async function retryQueued(clientId: string): Promise<void> {
  await updateItem(clientId, { state: "queued", error: null, errorCode: null });
  emit({ type: "changed" });
}

/**
 * The same multipart body the task page sends (see POST /api/hunts/[huntId]/submissions).
 * A queued item (with `createdAt`) also says how long it has been waiting.
 */
export function buildSubmissionForm(item: {
  clientId: string;
  taskId: string;
  teamId?: string | null;
  text?: string | null;
  files: QueuedFile[];
  poster?: QueuedFile | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  createdAt?: number;
}): FormData {
  const form = new FormData();
  form.set("taskId", item.taskId);
  form.set("clientId", item.clientId);
  if (item.teamId) form.set("teamId", item.teamId);
  // Measured on this phone's own clock, so a phone set to the wrong time still reports it right.
  if (item.createdAt != null) form.set("queuedFor", String(Math.max(0, Date.now() - item.createdAt)));
  if (item.text) form.set("text", item.text);
  for (const file of item.files) form.append("files", asTypedBlob(file), file.name);
  if (item.poster) form.set("poster", asTypedBlob(item.poster), item.poster.name);
  if (item.lat != null && item.lng != null) {
    form.set("lat", String(item.lat));
    form.set("lng", String(item.lng));
    if (item.accuracy != null) form.set("accuracy", String(item.accuracy));
  }
  return form;
}

function asTypedBlob(file: QueuedFile): Blob {
  return file.blob.type || !file.type ? file.blob : new Blob([file.blob], { type: file.type });
}

type Counts = { sent: number; failed: number; remaining: number };
let inFlight: Promise<Counts> | null = null;

/**
 * Tries to send every queued submission (POST /api/hunts/[huntId]/submissions).
 * Removes sent ones, marks non-retryable failures, keeps the rest for later.
 */
export function flushQueue(): Promise<Counts> {
  inFlight ??= runExclusive().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Whether this code runs in the service worker (Background Sync) rather than a page. */
function inServiceWorker(): boolean {
  const scope = (globalThis as { ServiceWorkerGlobalScope?: new () => unknown }).ServiceWorkerGlobalScope;
  return typeof scope === "function" && globalThis instanceof scope;
}

async function runExclusive(): Promise<Counts> {
  const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks;
  if (locks?.request) {
    // A sync event that gave up because a page was busy sending would count as a failed
    // sync (and the browser only retries a few times), so the service worker waits its turn.
    if (inServiceWorker()) return locks.request(LOCK, () => flushOnce());
    let counts: Counts | null = null;
    await locks.request(LOCK, { ifAvailable: true }, async (lock) => {
      // Another tab or the service worker is already sending; report where things stand.
      counts = lock ? await flushOnce() : { sent: 0, failed: 0, remaining: await remainingCount() };
    });
    return counts ?? { sent: 0, failed: 0, remaining: await remainingCount() };
  }
  return flushOnce();
}

async function remainingCount(): Promise<number> {
  try {
    return (await listQueued()).filter((item) => item.state !== "failed").length;
  } catch {
    return 0;
  }
}

type Refusal = { error: string; code: string | null };

/** The server's reason for turning an upload down, or null when the reply isn't from our server. */
async function readRefusal(res: Response): Promise<Refusal | null> {
  if (res.redirected) return null;
  try {
    const body = (await res.json()) as { ok?: unknown; error?: unknown; code?: unknown };
    if (body.ok === false && typeof body.error === "string" && body.error) {
      return { error: body.error, code: typeof body.code === "string" ? body.code : null };
    }
  } catch {
    // Not JSON: a proxy or login page answered, not the hunt.
  }
  return null;
}

/** The server's reply to an upload, or null when a 2xx isn't ours (a Wi-Fi login page, say). */
async function readReply(res: Response): Promise<{ result: SentResult | null } | null> {
  if (res.redirected) return null;
  try {
    const body = (await res.json()) as { ok?: unknown; submission?: SentResult };
    return body.ok === true ? { result: body.submission ?? null } : null;
  } catch {
    return null;
  }
}

async function flushOnce(): Promise<Counts> {
  let items: QueuedSubmission[];
  try {
    items = await listQueued();
  } catch {
    return { sent: 0, failed: 0, remaining: 0 };
  }
  let sent = 0;
  let failed = 0;
  // Holding the lock means nobody else is sending, so a "sending" item is left
  // over from a page that closed mid-upload: send it again (same clientId).
  for (const queued of items.filter((item) => item.state !== "failed")) {
    const item = (await updateItem(queued.clientId, { state: "sending" })) ?? null;
    if (!item) continue; // removed meanwhile
    emit({ type: "changed" });
    let res: Response;
    try {
      res = await fetch(`/api/hunts/${encodeURIComponent(item.huntId)}/submissions`, {
        method: "POST",
        body: buildSubmissionForm(item),
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
    } catch {
      // No connection: stop here, everything after this would fail the same way.
      await updateItem(item.clientId, { state: "queued", attempts: item.attempts + 1, lastAttemptAt: Date.now() });
      emit({ type: "changed" });
      break;
    }
    const reply = res.ok ? await readReply(res) : null;
    const refusal: Refusal | null =
      !reply && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429
        ? ((await readRefusal(res)) ??
          // A proxy's "too large" is as final as ours.
          (res.status === 413
            ? { error: "That’s too much to send at once. Send fewer or smaller files.", code: null }
            : null))
        : null;
    if (refusal?.code === "already_completed") {
      // A teammate finished the task while this waited: nothing is missing, so it just goes.
      await inStore("readwrite", (store) => store.delete(item.clientId));
      sent += 1;
      emit({
        type: "already",
        clientId: item.clientId,
        huntId: item.huntId,
        taskId: item.taskId,
        label: item.label ?? null,
      });
    } else if (reply) {
      const { result } = reply;
      await inStore("readwrite", (store) => store.delete(item.clientId));
      sent += 1;
      emit({
        type: "sent",
        clientId: item.clientId,
        huntId: item.huntId,
        taskId: item.taskId,
        label: item.label ?? null,
        result,
      });
    } else if (refusal) {
      const { error, code } = refusal;
      await updateItem(item.clientId, {
        state: "failed",
        error,
        errorCode: code,
        attempts: item.attempts + 1,
        lastAttemptAt: Date.now(),
      });
      failed += 1;
      emit({
        type: "failed",
        clientId: item.clientId,
        huntId: item.huntId,
        taskId: item.taskId,
        label: item.label ?? null,
        error,
      });
    } else {
      // 408, 429, 5xx, or a reply that didn't come from our server: try again later.
      await updateItem(item.clientId, { state: "queued", attempts: item.attempts + 1, lastAttemptAt: Date.now() });
    }
    emit({ type: "changed" });
  }
  return { sent, failed, remaining: await remainingCount() };
}
