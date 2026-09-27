"use client";

import { Eye, Keyboard, MessageSquareText, SkipForward, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { useNow } from "@/components/ui/clock";
import { ControlMarker } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/countdown";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { StatusGlyph } from "@/components/ui/status";
import { TeamBadge } from "@/components/ui/team-badge";
import { toast } from "@/components/ui/toast";
import type { SubmissionStatus, TaskKind } from "@/lib/db/schema";
import { formatRelative, formatSigned } from "@/lib/format";
import { claimSubmission, judgeSubmission, releaseClaim, revertJudgement } from "@/lib/judging/actions";
import { CLAIM_HEARTBEAT_MS, CLAIM_IDLE_MS, isClaimLive, QUEUE_MAX, QUEUE_PAGE_SIZE } from "@/lib/judging/constants";
import { firstName, KIND_FILTERS, possessive } from "@/lib/judging/labels";
import {
  type Claim,
  type Draft,
  EMPTY_DRAFT,
  type JudgeQueueData,
  type JudgeResult,
  type QueueItem,
} from "@/lib/judging/types";
import {
  expandScoring,
  parseMeasured,
  parsePoints,
  projectApproval,
  type TaskScoringContext,
} from "@/lib/judging/what-if";
import { cn } from "@/lib/utils";
import { appendFeedback, FeedbackField, type FieldError, PointsField } from "./decision-fields";
import { KeyHint } from "./key-hint";
import { inZoomedPhoto, LocationLink, MediaStage, SubmissionText } from "./media-viewer";
import { QueueList, waitLabel } from "./queue-list";
import { RecentDecisions } from "./recent-decisions";
import { ShortcutSheet } from "./shortcut-sheet";
import { useSingleKeys } from "./single-keys";
import { SubmissionHistory } from "./submission-history";
import { TaskBrief } from "./task-brief";
import { UndoToast, type UndoToastState } from "./undo-toast";

type Filters = { task: string | null; team: string | null; kind: TaskKind | null };
const NO_FILTERS: Filters = { task: null, team: null, kind: null };

type UndoRecord = UndoToastState & {
  item: QueueItem;
  draft: Draft;
  judgedAt: number;
  /** What approving was worth when the decision was made, for an undo the server hasn't caught up with. */
  scoring: TaskScoringContext | null;
};

/** Why the open submission changed, for the screen reader announcement (null: say nothing). */
type Reason = "move" | "decided" | "skipped" | "undone" | "reopened";

const DESKTOP = "(min-width: 1024px)";
const REFRESH_MS = 20_000;
/** Submissions sent this recently get the "New" flag when they show up in the queue. */
const NEW_MS = 2 * 60_000;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"].includes(type);
}

function without<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

/**
 * Brings a queue item into view by scrolling only the queue's own scrollers
 * (and on phones the page, back up to the strip). el.scrollIntoView() would
 * also move Chrome's sequential focus starting point to the item, so the
 * judge's first Tab would skip the sidebar, the filters and the queue.
 */
function revealInQueue(el: HTMLElement, container: HTMLElement | null) {
  for (let node = el.parentElement; node && container?.contains(node); node = node.parentElement) {
    const style = getComputedStyle(node);
    const item = el.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    if (/auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth) {
      if (item.left < box.left) node.scrollLeft -= box.left - item.left;
      else if (item.right > box.right) node.scrollLeft += item.right - box.right;
    }
    if (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      if (item.top < box.top) node.scrollTop -= box.top - item.top;
      else if (item.bottom > box.bottom) node.scrollTop += item.bottom - box.bottom;
    }
  }
  if (!window.matchMedia(DESKTOP).matches) {
    // Phones scroll the page: bring the strip back into view below the sticky header.
    const item = el.getBoundingClientRect();
    const top = 80;
    if (item.top < top) window.scrollBy({ top: item.top - top });
    else if (item.bottom > window.innerHeight) window.scrollBy({ top: item.bottom - window.innerHeight });
  }
}

export type JudgeWorkspaceProps = {
  huntId: string;
  me: { id: string; name: string };
  /** One page of the queue (see loadJudgeQueue); filters and paging live in the URL. */
  data: JudgeQueueData;
  /** The loaded submissions' task descriptions, rendered on the server. */
  descriptions: Record<string, ReactNode>;
  templates: string[];
  /** The submission open in the URL when the page loaded. */
  initialId: string | null;
  serverNow: number;
  /** Organizer links (omitted for judges). */
  settingsHref: string | null;
  taskHrefBase: string | null;
  archived: boolean;
  ended: boolean;
  /** Draft or scheduled: nobody can submit yet. */
  notStarted: boolean;
};

export function JudgeWorkspace({
  huntId,
  me,
  data,
  descriptions,
  templates,
  initialId,
  serverNow,
  settingsHref,
  taskHrefBase,
  archived,
  ended,
  notStarted,
}: JudgeWorkspaceProps) {
  const router = useRouter();
  const now = useNow(serverNow);
  const [singleKeys, setSingleKeys] = useSingleKeys();
  const [navigating, startNavigation] = useTransition();

  const [filters, setFilters] = useState<Filters>(() => ({
    task: data.query.task,
    team: data.query.team,
    kind: data.query.kind,
  }));
  // Pick the first submission during render (not in an effect) so the server
  // and the first client render agree and nothing flashes on load.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialId) return initialId;
    const first = data.items.find((i) => !isClaimLive(i.claim, me.id, serverNow));
    return first?.id ?? null;
  });
  /** Decided here, still pending in the last server render. */
  const [decided, setDecided] = useState<ReadonlyMap<string, SubmissionStatus>>(() => new Map());
  /** Undone here, not yet back in the last server render. */
  const [restored, setRestored] = useState<ReadonlyMap<string, QueueItem>>(() => new Map());
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [learnedClaims, setLearnedClaims] = useState<Record<string, Claim>>({});
  /** Scoring for undone submissions (by id), kept until the server sends them again. */
  const [keptScoring, setKeptScoring] = useState<Record<string, TaskScoringContext>>({});
  const [undo, setUndo] = useState<UndoRecord | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [saving, setSaving] = useState(0);
  const [fieldError, setFieldError] = useState<(FieldError & { id: string }) | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [sheet, setSheet] = useState<"shortcuts" | "feedback" | "filters" | null>(null);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [arrivals, setArrivals] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [focusRequest, setFocusRequest] = useState<{ target: "override" | "value"; n: number } | null>(null);
  /** Why decisions can't be saved anymore (removed from the staff, signed out), once we know. */
  const [lostAccess, setLostAccess] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /** Descriptions seen so far, for a submission that's back before the server sends its task again. */
  const [knownDescriptions, setKnownDescriptions] = useState<Record<string, ReactNode>>(descriptions);

  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const overrideRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const queueRef = useRef<HTMLElement>(null);
  const decisionScrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const claimedRef = useRef<string | null>(null);
  const lastActivity = useRef(Date.now());
  const undoSeq = useRef(0);
  const reason = useRef<Reason | null>(null);

  const readOnly = archived || lostAccess != null;

  // ---------------------------------------------------------------- queue --

  const allItems = useMemo(() => {
    const byId = new Map<string, QueueItem>();
    for (const item of data.items) byId.set(item.id, item);
    for (const [id, item] of restored) if (!byId.has(id)) byId.set(id, item);
    return [...byId.values()]
      .filter((i) => !decided.has(i.id))
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  }, [data.items, restored, decided]);

  const matches = useCallback(
    (i: QueueItem) =>
      (!filters.task || i.taskId === filters.task) &&
      (!filters.team || i.teamId === filters.team) &&
      (!filters.kind || data.tasks[i.taskId]?.kind === filters.kind),
    [filters, data.tasks],
  );
  const visible = useMemo(() => allItems.filter(matches), [allItems, matches]);
  const selected = useMemo(
    () => (selectedId ? (visible.find((i) => i.id === selectedId) ?? null) : null),
    [visible, selectedId],
  );
  const vanished =
    selectedId != null &&
    !selected &&
    !allItems.some((i) => i.id === selectedId) &&
    !decided.has(selectedId) &&
    awaiting !== selectedId;

  const claimOf = useCallback(
    (item: QueueItem): Claim | null => {
      const fromServer = item.claim;
      const learned = learnedClaims[item.id];
      if (!fromServer) return learned ?? null;
      if (!learned) return fromServer;
      return learned.at > fromServer.at ? learned : fromServer;
    },
    [learnedClaims],
  );

  /** The oldest submission nobody else is reviewing, preferring ones not skipped. */
  const pick = useCallback(
    (list: QueueItem[], skip: ReadonlySet<string> = skipped): QueueItem | null => {
      const t = Date.now();
      const free = list.filter((i) => !isClaimLive(claimOf(i), me.id, t));
      return free.find((i) => !skip.has(i.id)) ?? free[0] ?? null;
    },
    [skipped, claimOf, me.id],
  );

  // Choose something to look at whenever nothing valid is selected.
  useEffect(() => {
    if (selected || vanished || awaiting) return;
    const next = pick(visible);
    setSelectedId(next?.id ?? null);
  }, [selected, vanished, awaiting, visible, pick]);

  // The server counts the whole queue; adjust for what was decided or undone
  // here since its last render.
  const loadedIds = useMemo(() => new Set(data.items.map((i) => i.id)), [data.items]);
  const gone = useMemo(() => data.items.filter((i) => decided.has(i.id)), [data.items, decided]);
  const back = useMemo(() => [...restored.values()].filter((i) => !loadedIds.has(i.id)), [restored, loadedIds]);
  const adjust = (base: number, pred: (i: QueueItem) => boolean) =>
    Math.max(0, base - gone.filter(pred).length + back.filter(pred).length);
  const total = adjust(data.counts.total, () => true);
  const filtered = !!(filters.task || filters.team || filters.kind);
  const loadedForFilters =
    filters.task === data.query.task && filters.team === data.query.team && filters.kind === data.query.kind;
  /** Waiting submissions that match the filters (null while the page for new filters loads). */
  const matching = loadedForFilters ? adjust(data.counts.matching, matches) : null;
  const hiddenByFilter = matching == null ? null : Math.max(0, total - matching);

  // Reconcile local bookkeeping with each fresh server render.
  useEffect(() => {
    const ids = new Set(data.items.map((i) => i.id));
    setDecided((prev) => {
      const gone = [...prev.keys()].filter((id) => !ids.has(id));
      if (gone.length === 0) return prev;
      const next = new Map(prev);
      for (const id of gone) next.delete(id);
      return next;
    });
    // An undone submission is settled once the server sends it again, or once the
    // server was asked for it by id and it's missing (someone else decided it since).
    const settled = (id: string) => ids.has(id) || data.openId === id;
    setRestored((prev) => {
      const done = [...prev.keys()].filter(settled);
      if (done.length === 0) return prev;
      const next = new Map(prev);
      for (const id of done) next.delete(id);
      return next;
    });
    setKeptScoring((prev) => {
      const done = Object.keys(prev).filter(settled);
      if (done.length === 0) return prev;
      const next = { ...prev };
      for (const id of done) delete next[id];
      return next;
    });
    // The server's view of who has what open is at least as fresh as a claim
    // we bounced off earlier (the other judge may have moved on since).
    setLearnedClaims((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    // Flag what arrived while the queue was open. Older submissions that only
    // now fit on the loaded page (because the ones before them were judged) aren't new.
    if (!seenIds.current) {
      seenIds.current = ids;
      return;
    }
    const arrived = data.items
      .filter((i) => !seenIds.current?.has(i.id) && serverNow - i.createdAt < NEW_MS)
      .map((i) => i.id);
    for (const id of ids) seenIds.current.add(id);
    setArrivals((prev) => {
      const next = new Map([...prev].filter(([id]) => ids.has(id)));
      const at = Date.now();
      for (const id of arrived) next.set(id, at);
      return next.size === prev.size && arrived.length === 0 ? prev : next;
    });
  }, [data.items, data.openId, serverNow]);

  useEffect(() => {
    setKnownDescriptions((prev) =>
      Object.keys(descriptions).every((id) => id in prev) ? prev : { ...prev, ...descriptions },
    );
  }, [descriptions]);

  // Who else has what open, on the precise clock (so the list and the viewer
  // always agree), but as a set that only changes identity when its contents do.
  const reviewingKey = allItems
    .filter((i) => isClaimLive(claimOf(i), me.id, now))
    .map((i) => i.id)
    .join(",");
  const reviewing = useMemo<ReadonlySet<string>>(
    () => new Set(reviewingKey ? reviewingKey.split(",") : []),
    [reviewingKey],
  );

  // The queue only shows minutes, so it re-renders on a coarse clock, not every second.
  const coarseNow = Math.floor(now / 15_000) * 15_000;
  const fresh = useMemo(() => {
    const out = new Set<string>();
    for (const [id, at] of arrivals) if (coarseNow - at < 60_000) out.add(id);
    return out;
  }, [arrivals, coarseNow]);

  // A reopened submission is selected as soon as it's back in the queue.
  useEffect(() => {
    if (!awaiting) return;
    if (allItems.some((i) => i.id === awaiting)) {
      reason.current = "reopened";
      setSelectedId(awaiting);
      setAwaiting(null);
      return;
    }
    const t = setTimeout(() => setAwaiting(null), 10_000);
    return () => clearTimeout(t);
  }, [awaiting, allItems]);

  /** Loads another page of the queue: new filters, more submissions, or one by id. */
  const navigate = (next: { filters?: Filters; limit?: number; id?: string | null }) => {
    const f = next.filters ?? filters;
    const id = next.id !== undefined ? next.id : (selected?.id ?? selectedId);
    const limit = next.limit ?? data.query.limit;
    const params = new URLSearchParams();
    if (id) params.set("id", id);
    if (f.task) params.set("task", f.task);
    if (f.team) params.set("team", f.team);
    if (f.kind) params.set("kind", f.kind);
    if (limit > QUEUE_PAGE_SIZE) params.set("limit", String(limit));
    const qs = params.toString();
    startNavigation(() => router.replace(`/manage/${huntId}/judge${qs ? `?${qs}` : ""}`, { scroll: false }));
  };

  const changeFilters = (next: Filters) => {
    setFilters(next);
    navigate({ filters: next, limit: QUEUE_PAGE_SIZE });
  };

  // Keep the open submission in the URL so a reload (and every refresh) lands on it.
  // Deferred a tick: on first load this effect can run before the App
  // Router's own effects have initialized it (children's effects run first),
  // and Next routes history.replaceState through the router. Never while a
  // queue page is loading: the router would drop that navigation for this one.
  useEffect(() => {
    if (navigating) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const id = selected?.id ?? (vanished ? selectedId : null);
      if (id) params.set("id", id);
      else params.delete("id");
      const qs = params.toString();
      const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
    }, 0);
    return () => clearTimeout(t);
  }, [selected?.id, vanished, selectedId, navigating]);

  // ---------------------------------------------------------------- claims --

  const selectedKey = selected?.id ?? null;
  useEffect(() => {
    if (selectedKey === claimedRef.current) return;
    // Wait until the selection settles so holding J doesn't claim everything on the way.
    const t = setTimeout(() => {
      const previous = claimedRef.current;
      claimedRef.current = selectedKey;
      if (!selectedKey) {
        if (previous) releaseClaim({ huntId, submissionId: previous }).catch(() => {});
        return;
      }
      claimSubmission({ huntId, submissionId: selectedKey, releaseId: previous })
        .then((res) => {
          if (!res.ok) {
            if (res.lostAccess) setLostAccess(res.error);
            return;
          }
          if (!res.claimed && !res.judged) setLearnedClaims((c) => ({ ...c, [selectedKey]: res.by }));
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [selectedKey, huntId]);

  useEffect(() => {
    if (!selectedKey || lostAccess) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible" || claimedRef.current !== selectedKey) return;
      // A judge who walked away shouldn't hold the submission hostage: let the claim lapse.
      if (Date.now() - lastActivity.current > CLAIM_IDLE_MS) return;
      claimSubmission({ huntId, submissionId: selectedKey })
        .then((res) => {
          if (!res.ok && res.lostAccess) setLostAccess(res.error);
        })
        .catch(() => {});
    }, CLAIM_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [selectedKey, huntId, lostAccess]);

  useEffect(() => {
    const seen = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const type of events) window.addEventListener(type, seen, { passive: true });
    return () => {
      for (const type of events) window.removeEventListener(type, seen);
    };
  }, []);

  useEffect(
    () => () => {
      const id = claimedRef.current;
      if (id) releaseClaim({ huntId, submissionId: id }).catch(() => {});
    },
    [huntId],
  );

  // Claims and waiting times aren't broadcast; refresh now and then (not once
  // access is gone: the page would turn into a "not found").
  useEffect(() => {
    if (lostAccess) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [router, lostAccess]);

  // ------------------------------------------------------------ niceties --

  // Keep the open submission in view in the queue; if the keyboard focus was
  // in the queue, let it follow the selection (roving focus).
  const focusQueue = useRef(false);
  useEffect(() => {
    if (!selectedKey) return;
    // A new submission starts at its top: the photo and the task, not wherever the last one was scrolled to.
    viewerRef.current?.scrollTo({ top: 0 });
    decisionScrollRef.current?.scrollTo({ top: 0 });
    const el = document.querySelector<HTMLElement>(`[data-queue-id="${CSS.escape(selectedKey)}"]`);
    if (el) revealInQueue(el, queueRef.current);
    if (focusQueue.current) {
      focusQueue.current = false;
      el?.focus({ preventScroll: true });
    }
  }, [selectedKey]);

  // Warm the cache for the next photos so moving on feels instant.
  useEffect(() => {
    if (!selectedKey) return;
    const index = visible.findIndex((i) => i.id === selectedKey);
    for (const item of visible.slice(index + 1, index + 3)) {
      const file = item.files[0];
      if (file?.kind === "image") {
        const img = new Image();
        img.src = file.display;
      }
    }
  }, [selectedKey, visible]);

  // Focus a field once it has rendered (with its error, so the error is read with it).
  useEffect(() => {
    if (!focusRequest) return;
    const el = focusRequest.target === "override" ? overrideRef.current : valueRef.current;
    el?.focus();
    el?.select();
  }, [focusRequest]);

  const requestFocus = (target: "override" | "value") => setFocusRequest((r) => ({ target, n: (r?.n ?? 0) + 1 }));

  // --------------------------------------------------------------- drafts --

  const draftOf = useCallback((id: string) => drafts[id] ?? EMPTY_DRAFT, [drafts]);
  const updateDraft = useCallback((id: string, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? EMPTY_DRAFT), ...patch } }));
    setFieldError((e) => (e && e.id === id ? null : e));
  }, []);

  // Stable handlers for whichever submission is open, so the memoized panels
  // don't re-render on every clock tick.
  const openId = selectedId;
  const onDraftOpen = useCallback(
    (patch: Partial<Draft>) => {
      if (openId) updateDraft(openId, patch);
    },
    [openId, updateDraft],
  );
  const onFeedbackOpen = useCallback((value: string) => onDraftOpen({ feedback: value }), [onDraftOpen]);
  const onInsertOpen = useCallback(
    (template: string) => {
      if (!openId) return;
      setDrafts((d) => {
        const current = d[openId] ?? EMPTY_DRAFT;
        return { ...d, [openId]: { ...current, feedback: appendFeedback(current.feedback, template) } };
      });
    },
    [openId],
  );

  // What approving is worth: the server's compact rows, run through the real engine here.
  const engineTeams = useMemo(
    () => Object.values(data.teams).map((t) => ({ id: t.id, name: t.name, hidden: t.hidden })),
    [data.teams],
  );
  const contexts = useMemo(() => {
    const out: Record<string, TaskScoringContext> = {};
    for (const [taskId, compact] of Object.entries(data.scoring)) out[taskId] = expandScoring(compact, engineTeams);
    return out;
  }, [data.scoring, engineTeams]);
  const contextFor = useCallback(
    (item: QueueItem): TaskScoringContext | null =>
      (restored.has(item.id) ? keptScoring[item.id] : undefined) ??
      contexts[item.taskId] ??
      keptScoring[item.id] ??
      null,
    [restored, keptScoring, contexts],
  );

  const projectionFor = useCallback(
    (item: QueueItem, draft: Draft) => {
      const ctx = contextFor(item);
      if (!ctx) return null;
      const value = parseMeasured(draft.value);
      const override = draft.override == null ? null : parsePoints(draft.override);
      return projectApproval(
        ctx,
        { id: item.id, teamId: item.teamId, submittedAt: item.createdAt },
        {
          contestValue: value != null && Number.isFinite(value) ? value : null,
          pointsOverride: override != null && Number.isFinite(override) ? override : null,
        },
      );
    },
    [contextFor],
  );

  const task = selected ? data.tasks[selected.taskId] : null;
  const team = selected ? data.teams[selected.teamId] : null;
  const draft = selected ? draftOf(selected.id) : EMPTY_DRAFT;
  const projection = useMemo(
    () => (selected ? projectionFor(selected, draft) : null),
    [selected, draft, projectionFor],
  );
  const selectedClaim = selected ? claimOf(selected) : null;
  const claimedByOther = selected ? isClaimLive(selectedClaim, me.id, now) : false;
  // The score change approving would make, shown on the button ("Approve +117"); nothing when it's 0.
  const approveDelta =
    projection && task && (task.kind !== "contest" || projection.place != null || !task.needsValue)
      ? projection.points - projection.without || null
      : null;
  const description = selected ? (descriptions[selected.taskId] ?? knownDescriptions[selected.taskId] ?? null) : null;

  // ------------------------------------------------------- announcements --

  /** One polite live region for the queue: what's open now, and what undo did. */
  const announce = useCallback((text: string) => {
    // The same words twice in a row need a change to be read again.
    setAnnouncement((prev) => (prev === text ? `${text} ` : text));
  }, []);

  const announceSelection = useEffectEvent((_openId: string | null) => {
    const why = reason.current;
    reason.current = null;
    if (!why) return;
    if (!selected || !task || !team) {
      if (why === "decided" && total === 0) announce("That was the last one. Nothing else is waiting.");
      return;
    }
    const what = `${task.code} ${task.title} from ${team.name}`;
    const where = matching != null ? `, ${visible.indexOf(selected) + 1} of ${matching}` : "";
    announce(
      why === "undone"
        ? `Undone. ${what} is open again.`
        : why === "reopened"
          ? `${what} is back in the queue and open.`
          : why === "decided"
            ? `Next: ${what}${where}.`
            : `${what}${where}.`,
    );
  });
  useEffect(() => {
    announceSelection(selectedKey);
  }, [selectedKey]);

  // ------------------------------------------------------------- actions --

  const leaveFields = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && isTyping(active)) viewerRef.current?.focus({ preventScroll: true });
  }, []);

  const selectFromQueue = useCallback(
    (id: string) => {
      leaveFields();
      reason.current = "move";
      setSelectedId(id);
    },
    [leaveFields],
  );

  const failField = (id: string, field: FieldError["field"], message: string) => {
    setFieldError({ id, field, message });
    if (field === "contestValue") requestFocus("value");
    if (field === "pointsOverride") requestFocus("override");
    if (!window.matchMedia(DESKTOP).matches) toast({ title: message, tone: "danger" });
  };

  const decide = async (decision: "approve" | "reject") => {
    if (!selected || !task || !team || readOnly) return;
    const item = selected;
    const itemTask = task;
    const itemTeam = team;
    const itemDraft = draftOf(item.id);
    const value = parseMeasured(itemDraft.value);
    const override = itemDraft.override == null ? null : parsePoints(itemDraft.override);
    const isContest = itemTask.kind === "contest";
    if (decision === "approve") {
      if (isContest && itemTask.needsValue && value == null) {
        failField(
          item.id,
          "contestValue",
          `Enter the measured value${itemTask.contestUnit ? ` in ${itemTask.contestUnit}` : ""} to approve.`,
        );
        return;
      }
      if (isContest && value != null && Number.isNaN(value)) {
        failField(item.id, "contestValue", "Type the value as a number, like 1500 or 18.5.");
        return;
      }
      if (!isContest && override != null && Number.isNaN(override)) {
        failField(item.id, "pointsOverride", "Points must be a whole number, like 80.");
        return;
      }
    }
    const before = projectionFor(item, itemDraft)?.without ?? 0;
    const itemScoring = contextFor(item);

    const next = pick(visible.filter((i) => i.id !== item.id));
    setDecided((m) => new Map(m).set(item.id, decision === "approve" ? "approved" : "rejected"));
    setRestored((m) => without(m, item.id));
    reason.current = "decided";
    setSelectedId(next?.id ?? null);
    setFieldError(null);
    setUndo(null);
    leaveFields();
    setSaving((n) => n + 1);

    let result: JudgeResult;
    try {
      result = await judgeSubmission({
        huntId,
        submissionId: item.id,
        decision,
        pointsOverride: decision === "approve" && !isContest ? override : null,
        contestValue: decision === "approve" && isContest && value != null && !Number.isNaN(value) ? value : null,
        feedback: itemDraft.feedback.trim() || null,
        expectedJudgedAt: null,
        from: "queue",
      });
    } catch {
      result = { ok: false, error: "Couldn’t reach the server. Check your connection and try again." };
    } finally {
      setSaving((n) => n - 1);
    }

    if (!result.ok) {
      if (result.stale) {
        toast({ title: result.error });
        return;
      }
      setDecided((m) => without(m, item.id));
      setRestored((m) => new Map(m).set(item.id, item));
      if (result.lostAccess) {
        setLostAccess(result.error);
        toast({
          title: `Not saved: ${itemTeam.name}, ${itemTask.code} ${itemTask.title}`,
          description: result.error,
          tone: "danger",
        });
        return;
      }
      if (result.field) setFieldError({ id: item.id, field: result.field, message: result.error });
      toast({
        title: `Not saved: ${itemTeam.name}, ${itemTask.code} ${itemTask.title}`,
        description: `${result.error} It’s back in the queue.`,
        tone: "danger",
        durationMs: 8000,
      });
      return;
    }

    setDrafts((d) => {
      if (!(item.id in d)) return d;
      const rest = { ...d };
      delete rest[item.id];
      return rest;
    });
    undoSeq.current += 1;
    setUndo({
      key: undoSeq.current,
      item,
      draft: itemDraft,
      scoring: itemScoring,
      judgedAt: result.judgedAt ?? 0,
      status: result.status === "approved" ? "approved" : "rejected",
      message: `${decision === "approve" ? "Approved" : "Rejected"} ${itemTeam.name}`,
      delta: decision === "approve" && result.points !== before ? formatSigned(result.points - before) : null,
    });
  };

  const doUndo = async () => {
    const record = undo;
    if (!record || undoing || lostAccess) return;
    setUndoing(true);
    let result: JudgeResult;
    try {
      result = await revertJudgement({
        huntId,
        submissionId: record.item.id,
        expectedJudgedAt: record.judgedAt,
        from: "queue",
      });
    } catch {
      result = { ok: false, error: "Couldn’t reach the server. Try again." };
    }
    setUndoing(false);
    setUndo(null);
    if (!result.ok) {
      if (result.lostAccess) setLostAccess(result.error);
      toast({ title: "Couldn’t undo", description: result.error, tone: "danger" });
      return;
    }
    const item = { ...record.item, claim: null };
    const scoring = record.scoring;
    if (scoring) setKeptScoring((m) => ({ ...m, [item.id]: scoring }));
    setDecided((m) => without(m, item.id));
    setRestored((m) => new Map(m).set(item.id, item));
    setDrafts((d) => ({ ...d, [item.id]: record.draft }));
    if (!matches(item)) {
      setFilters(NO_FILTERS);
      navigate({ filters: NO_FILTERS, limit: QUEUE_PAGE_SIZE, id: item.id });
    }
    reason.current = "undone";
    setSelectedId(item.id);
  };

  const reopen = async (id: string) => {
    if (readOnly) return;
    setReopening(id);
    let result: JudgeResult;
    try {
      result = await revertJudgement({ huntId, submissionId: id, from: "queue" });
    } catch {
      result = { ok: false, error: "Couldn’t reach the server. Try again." };
    }
    setReopening(null);
    if (!result.ok) {
      if (result.lostAccess) setLostAccess(result.error);
      toast({ title: "Couldn’t reopen it", description: result.error, tone: "danger" });
      return;
    }
    toast({ title: result.message });
    setFilters(NO_FILTERS);
    setAwaiting(id);
    // Ask for it by id: it may be newer than the page of the queue that's loaded.
    navigate({ filters: NO_FILTERS, limit: QUEUE_PAGE_SIZE, id });
  };

  const skip = () => {
    if (!selected) return;
    const id = selected.id;
    const nextSkipped = new Set(skipped).add(id);
    setSkipped(nextSkipped);
    const next = pick(
      visible.filter((i) => i.id !== id),
      nextSkipped,
    );
    if (!next) {
      toast({
        title:
          visible.length > 1
            ? "Everything else is open with another judge. Pick one from the queue to look anyway."
            : filtered
              ? "Nothing else is waiting for these filters."
              : "Nothing else is waiting right now.",
      });
      return;
    }
    leaveFields();
    reason.current = "skipped";
    setSelectedId(next.id);
  };

  const move = (delta: 1 | -1) => {
    if (visible.length === 0) return;
    focusQueue.current = !!(document.activeElement as HTMLElement | null)?.closest("[data-queue-id]");
    const index = selected ? visible.findIndex((i) => i.id === selected.id) : -1;
    const target = index === -1 ? 0 : Math.min(visible.length - 1, Math.max(0, index + delta));
    // With the focus in the queue, the focused item already says which one it is.
    reason.current = focusQueue.current ? null : "move";
    setSelectedId(visible[target].id);
  };

  const goNext = () => {
    const next = pick(visible);
    reason.current = "move";
    setSelectedId(next?.id ?? null);
  };

  const insertTemplate = (index: number) => {
    const template = templates[index];
    if (!selected || !template) return;
    updateDraft(selected.id, { feedback: appendFeedback(draftOf(selected.id).feedback, template) });
  };

  const focusFeedback = () => {
    if (!window.matchMedia(DESKTOP).matches) {
      setSheet("feedback");
      return;
    }
    const el = feedbackRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };

  const focusPoints = () => {
    if (!selected || !task || !projection) return;
    if (task.kind === "contest") {
      valueRef.current?.focus();
      return;
    }
    // An earlier accepted submission is the team's solve; there are no points to set here.
    if (projection.alreadySolved) return;
    if (draftOf(selected.id).override == null) updateDraft(selected.id, { override: String(projection.points) });
    requestFocus("override");
  };

  /** In the points and value fields, A and R still decide right after a number (letters aren't points). */
  const decidesFromField = (input: HTMLInputElement) => {
    if (input === overrideRef.current) return true;
    const text = input.value;
    // In the measured value a letter after a space may start a unit ("31 bikes"); right after a digit it's a shortcut.
    return text.trim() === "" || (/\d$/.test(text) && !/\p{L}/u.test(text));
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (document.querySelector("dialog[open]")) return;
    const typing = isTyping(e.target);
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "Enter") {
      e.preventDefault();
      void decide("approve");
      return;
    }
    if (typing) {
      const input = e.target as HTMLInputElement;
      const decisionField = input === valueRef.current || input === overrideRef.current;
      if (decisionField && !mod && !e.altKey) {
        if (e.key === "Enter") {
          e.preventDefault();
          void decide("approve");
          return;
        }
        const k = e.key.toLowerCase();
        if (singleKeys && (k === "a" || k === "r") && decidesFromField(input)) {
          e.preventDefault();
          void decide(k === "a" ? "approve" : "reject");
          return;
        }
      }
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return;
    }
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey && undo) {
      e.preventDefault();
      void doUndo();
      return;
    }
    if (mod || e.altKey) return;
    // Letters, digits and "?" can be turned off (the arrow keys and Enter can't).
    if (e.key.length === 1 && !singleKeys) return;
    switch (e.key) {
      case "a":
      case "A":
        void decide("approve");
        break;
      case "r":
      case "R":
        void decide("reject");
        break;
      case "s":
      case "S":
        skip();
        break;
      case "ArrowDown":
      case "ArrowUp":
        // In a zoomed-in photo the arrow keys look around it.
        if (inZoomedPhoto(e.target)) return;
        move(e.key === "ArrowDown" ? 1 : -1);
        break;
      case "j":
      case "J":
        move(1);
        break;
      case "k":
      case "K":
        move(-1);
        break;
      case "f":
      case "F":
        focusFeedback();
        break;
      case "p":
      case "P":
        focusPoints();
        break;
      case "u":
      case "U":
        if (!undo) return;
        void doUndo();
        break;
      case "?":
        setSheet("shortcuts");
        break;
      case "Enter":
        if (!vanished || (e.target as HTMLElement | null)?.closest("a,button")) return;
        goNext();
        break;
      default:
        if (/^[1-9]$/.test(e.key) && templates.length >= Number(e.key)) {
          insertTemplate(Number(e.key) - 1);
          break;
        }
        return;
    }
    e.preventDefault();
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const dismissUndo = useCallback(() => setUndo(null), []);

  // --------------------------------------------------------------- render --

  const oldest =
    [data.counts.oldestAt, ...back.map((i) => i.createdAt)]
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b)[0] ?? null;
  const othersReviewing = visible.filter((i) => isClaimLive(claimOf(i), me.id, now));
  const activeFilters = [filters.task, filters.team, filters.kind].filter(Boolean).length;
  const moreWaiting = matching != null ? matching - visible.length : 0;
  const more =
    moreWaiting > 0 && data.query.limit < QUEUE_MAX
      ? {
          waiting: moreWaiting,
          next: Math.min(QUEUE_PAGE_SIZE, moreWaiting),
          onMore: () => navigate({ limit: data.query.limit + QUEUE_PAGE_SIZE }),
          loading: navigating,
        }
      : null;

  const taskOptions = Object.values(data.tasks).sort((a, b) => a.code - b.code);
  const teamOptions = Object.values(data.teams).sort((a, b) => a.name.localeCompare(b.name));
  const presentKinds = new Set(Object.values(data.tasks).map((t) => t.kind));
  const countBy = (key: "taskId" | "teamId", id: string) =>
    adjust((key === "taskId" ? data.counts.byTask : data.counts.byTeam)[id] ?? 0, (i) => i[key] === id);

  const filterControls = (compact: boolean) => (
    <>
      <FilterSelect
        label="Task"
        compact={compact}
        value={filters.task ?? ""}
        onChange={(v) => changeFilters({ ...filters, task: v || null })}
        options={[
          { value: "", label: "All tasks" },
          ...taskOptions.map((t) => {
            const n = countBy("taskId", t.id);
            return { value: t.id, label: `${t.code} ${t.title}${n ? ` (${n})` : ""}` };
          }),
        ]}
      />
      <FilterSelect
        label="Team"
        compact={compact}
        value={filters.team ?? ""}
        onChange={(v) => changeFilters({ ...filters, team: v || null })}
        options={[
          { value: "", label: "All teams" },
          ...teamOptions.map((t) => {
            const n = countBy("teamId", t.id);
            return { value: t.id, label: `${t.name}${n ? ` (${n})` : ""}` };
          }),
        ]}
      />
      <FilterSelect
        label="Kind"
        compact={compact}
        value={filters.kind ?? ""}
        onChange={(v) => changeFilters({ ...filters, kind: (v || null) as TaskKind | null })}
        options={[{ value: "", label: "All kinds" }, ...KIND_FILTERS.filter((k) => presentKinds.has(k.value))]}
      />
    </>
  );

  const header = (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 lg:h-16 lg:shrink-0 lg:flex-nowrap lg:border-b lg:border-line lg:px-6 lg:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="font-cond text-3xl leading-none font-extrabold tracking-tight">Judge</h1>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
          <span
            className={cn(
              "rounded-full px-2 py-1 font-bib text-base leading-none",
              total > 0 ? "bg-sun text-sun-ink" : "bg-mist text-ink-2",
            )}
          >
            {total}
          </span>
          waiting
        </p>
        {oldest ? (
          // The filters take this room between 1024 and 1280px.
          <p className="hidden text-sm whitespace-nowrap text-ink-2 sm:block lg:hidden xl:block">
            Oldest {waitLabel(Math.max(0, now - oldest))}
          </p>
        ) : null}
        {saving > 0 || navigating ? (
          <output className="flex items-center gap-1.5 text-sm text-ink-2">
            <Spinner className="size-4" />
            {saving > 0 ? "Saving" : "Loading"}
          </output>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {total > 0 ? <div className="hidden items-center gap-2 lg:flex">{filterControls(true)}</div> : null}
        {total > 0 ? (
          <Button variant={filtered ? "secondary" : "quiet"} className="lg:hidden" onClick={() => setSheet("filters")}>
            <SlidersHorizontal aria-hidden />
            {filtered ? `Filters (${activeFilters})` : "Filter"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          // Tablets with keyboards too: it's also where single-key shortcuts are turned back on.
          className="hidden md:inline-flex"
          onClick={() => setSheet("shortcuts")}
          aria-label="Keyboard shortcuts"
          title={singleKeys ? "Keyboard shortcuts (?)" : "Keyboard shortcuts"}
        >
          <Keyboard aria-hidden />
        </Button>
      </div>
    </header>
  );

  const lostNotice = lostAccess ? (
    <div role="alert" className="mb-3 lg:mx-6 lg:mt-3 lg:mb-0">
      <Notice tone="warning" title={lostAccess}>
        Decisions can’t be saved from this queue anymore.{" "}
        <Link href="/dashboard" className="font-semibold underline">
          Go to your hunts
        </Link>
      </Notice>
    </div>
  ) : null;

  const sheets = (
    <>
      <ShortcutSheet
        open={sheet === "shortcuts"}
        onClose={() => setSheet(null)}
        singleKeys={singleKeys}
        onSingleKeysChange={setSingleKeys}
      />
      <Dialog
        open={sheet === "filters"}
        onClose={() => setSheet(null)}
        title="Filter the queue"
        description="Oldest first within what you pick."
      >
        <div className="flex flex-col gap-4">
          {filterControls(false)}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" size="lg" onClick={() => setSheet(null)}>
              {matching == null ? (
                <>
                  <Spinner className="size-4" />
                  Show submissions
                </>
              ) : (
                `Show ${matching} ${matching === 1 ? "submission" : "submissions"}`
              )}
            </Button>
            {filtered ? (
              <Button variant="quiet" size="lg" onClick={() => changeFilters(NO_FILTERS)}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </Dialog>
      <Dialog
        open={sheet === "feedback" && !!selected}
        onClose={() => setSheet(null)}
        title={team ? `Feedback for ${team.name}` : "Feedback"}
        description="Sent with your decision."
      >
        {selected ? (
          <div className="flex flex-col gap-4">
            <FeedbackField
              templates={templates}
              value={draft.feedback}
              onChange={onFeedbackOpen}
              onInsert={onInsertOpen}
              settingsHref={settingsHref}
            />
            <Button size="lg" onClick={() => setSheet(null)}>
              Done
            </Button>
          </div>
        ) : null}
      </Dialog>
      <UndoToast
        state={undo}
        onUndo={() => void doUndo()}
        onDismiss={dismissUndo}
        undoing={undoing}
        singleKeys={singleKeys}
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );

  // Nothing waiting at all: a calm, centered "caught up" page.
  if (total === 0 && !awaiting) {
    const noTasks = taskOptions.length === 0;
    return (
      <>
        <div className="flex flex-col gap-2">
          {header}
          {lostNotice}
          {archived ? <ArchivedNotice settingsHref={settingsHref} /> : null}
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 pb-10">
            <EmptyState
              title={noTasks || notStarted ? "Nothing to judge yet" : "All caught up"}
              action={
                noTasks && taskHrefBase ? (
                  <ButtonLink href={`/manage/${huntId}/tasks`} variant="secondary">
                    Add tasks
                  </ButtonLink>
                ) : ended ? (
                  <ButtonLink href={`/manage/${huntId}/scoreboard`} variant="secondary">
                    Open the scoreboard
                  </ButtonLink>
                ) : null
              }
            >
              {noTasks
                ? "This hunt has no tasks yet. Once it has some, submissions show up here as teams send them."
                : ended
                  ? "The hunt is over and every submission has a decision. Final scores are on the scoreboard."
                  : notStarted
                    ? "Once the hunt starts, submissions appear here the moment teams send them."
                    : "New submissions appear here the moment teams send them. No need to reload."}
            </EmptyState>
            <RecentDecisions
              decisions={data.recent}
              tasks={data.tasks}
              teams={data.teams}
              huntId={huntId}
              serverNow={serverNow}
              onReopen={(id) => void reopen(id)}
              reopening={reopening}
              disabled={readOnly}
            />
          </div>
        </div>
        {sheets}
      </>
    );
  }

  const recentForGone = vanished ? data.recent.find((r) => r.id === selectedId) : undefined;

  return (
    <>
      <div className="flex flex-col pb-28 lg:fixed lg:inset-y-0 lg:right-0 lg:left-64 lg:z-10 lg:bg-paper lg:pb-0">
        {header}
        {lostNotice}
        {archived ? <ArchivedNotice settingsHref={settingsHref} className="lg:mx-6 lg:mt-3" /> : null}
        {ended && !archived ? (
          <Notice tone="info" className="mb-3 lg:mx-6 lg:mt-3 lg:mb-0">
            The hunt has ended. Scores update for everyone as you finish the queue.
          </Notice>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[6.25rem_minmax(0,1fr)_20rem] xl:grid-cols-[15rem_minmax(0,1fr)_21rem] 2xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
          {/* Queue */}
          <section
            ref={queueRef}
            aria-label="Queue"
            aria-busy={navigating || undefined}
            className={cn(
              "-mx-4 border-b border-line transition-opacity md:-mx-8 lg:mx-0 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0",
              navigating && "opacity-60",
            )}
          >
            <QueueList
              items={visible}
              selectedId={selected?.id ?? null}
              onSelect={selectFromQueue}
              tasks={data.tasks}
              teams={data.teams}
              claimOf={claimOf}
              reviewing={reviewing}
              now={coarseNow}
              fresh={fresh}
              skipped={skipped}
              more={more}
            />
            {filtered ? (
              // The narrow rail (1024–1280px) has no room for this; its header shows the filters.
              <p className="px-4 pb-3 text-sm text-ink-2 lg:hidden xl:block xl:py-3">
                {matching != null ? `${matching} of ${total} match the filters. ` : null}
                <button
                  type="button"
                  onClick={() => changeFilters(NO_FILTERS)}
                  className="font-semibold text-ink underline decoration-2 underline-offset-2"
                >
                  Clear filters
                </button>
              </p>
            ) : null}
          </section>

          {/* Viewer */}
          <section
            ref={viewerRef}
            tabIndex={-1}
            aria-label="Submission"
            className="-mx-4 bg-mist px-4 py-4 focus:outline-none md:-mx-8 md:px-8 lg:mx-0 lg:min-h-0 lg:overflow-y-auto lg:px-6 lg:py-5"
          >
            {vanished ? (
              <div className="grid min-h-[40vh] place-items-center text-center">
                <div className="max-w-sm">
                  <h2 className="font-cond text-2xl font-bold">
                    {recentForGone
                      ? `${recentForGone.byMe ? "You" : firstName(recentForGone.judgedBy)} ${recentForGone.status === "approved" ? "approved" : "rejected"} this one`
                      : "This one’s been handled"}
                  </h2>
                  <p className="mt-2 text-ink-2">It isn’t waiting for review anymore.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button onClick={goNext}>
                      Next submission
                      <KeyHint
                        k="Enter"
                        className="hidden lg:inline-flex"
                        kbdClassName="border-transparent bg-accent-ink/20 text-accent-ink"
                      />
                    </Button>
                    <ButtonLink variant="quiet" href={`/manage/${huntId}/submissions/${selectedId}`}>
                      See what happened
                    </ButtonLink>
                  </div>
                </div>
              </div>
            ) : selected && task && team ? (
              <div className="flex flex-col gap-4">
                {/* Phones: what the photo is for, before the photo (the decision panel has it on desktop). */}
                <div className="flex items-center gap-3 lg:hidden">
                  <ControlMarker code={task.code} state="pending" size="md" label={`Control ${task.code}`} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-cond text-2xl leading-tight font-extrabold tracking-tight break-words">
                      {task.title}
                    </h2>
                    <p className="text-sm text-ink-2">
                      {task.kindLabel}
                      {task.hidden ? ", hidden from players" : ""}
                    </p>
                  </div>
                </div>
                {claimedByOther && selectedClaim ? (
                  <Notice
                    tone="info"
                    icon={<Eye className="size-4" />}
                    title={`${firstName(selectedClaim.name)} opened this ${formatRelative(selectedClaim.at, now)}`}
                  >
                    Two judges on one submission is wasted effort. Decide only if you’ve agreed who takes it.
                  </Notice>
                ) : null}
                {selected.files.length > 0 ? (
                  <MediaStage
                    key={selected.id}
                    files={selected.files}
                    alt={`${possessive(team.name)} ${task.kindLabel.toLowerCase()} for ${task.code} ${task.title}`}
                  />
                ) : null}
                {selected.text ? (
                  <SubmissionText
                    text={selected.text}
                    kind={task.kind === "answer" ? "answer" : task.kind === "checkpoint" ? "checkpoint" : "note"}
                    prominent={selected.files.length === 0}
                  />
                ) : null}
                {selected.files.length === 0 && !selected.text ? (
                  <p className="rounded-lg bg-paper px-4 py-6 text-center text-ink-2">
                    Nothing was attached to this submission.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
                  <TeamBadge team={team} size="sm" nameClassName="text-ink" />
                  {team.hidden ? (
                    <span className="rounded-full bg-mist-2 px-2 py-0.5 text-xs font-semibold">Hidden team</span>
                  ) : null}
                  {selected.playerName ? <span>Sent by {selected.playerName}</span> : null}
                  <RelativeTime at={selected.createdAt} serverNow={serverNow} />
                  {selected.lat != null && selected.lng != null ? (
                    <LocationLink lat={selected.lat} lng={selected.lng} accuracy={selected.accuracy} />
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid min-h-[40vh] place-items-center text-center">
                <div className="max-w-sm">
                  {visible.length === 0 && (navigating || matching == null) ? (
                    <p className="flex items-center gap-2 text-ink-2">
                      <Spinner className="size-4" /> Loading the queue
                    </p>
                  ) : visible.length === 0 ? (
                    <>
                      <h2 className="font-cond text-2xl font-bold">Nothing waiting for these filters</h2>
                      <p className="mt-2 text-ink-2">
                        {hiddenByFilter} more {hiddenByFilter === 1 ? "is" : "are"} waiting in the full queue.
                      </p>
                      <Button className="mt-5" variant="secondary" onClick={() => changeFilters(NO_FILTERS)}>
                        Show the whole queue
                      </Button>
                    </>
                  ) : awaiting ? (
                    <p className="flex items-center gap-2 text-ink-2">
                      <Spinner className="size-4" /> Bringing it back
                    </p>
                  ) : (
                    <>
                      <h2 className="font-cond text-2xl font-bold">The rest is being reviewed</h2>
                      <p className="mt-2 text-ink-2">
                        {[...new Set(othersReviewing.map((i) => firstName(claimOf(i)?.name)))].join(" and ")}{" "}
                        {othersReviewing.length === 1 ? "has it" : "have them"} open. Pick one from the queue if you’re
                        helping out.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Decision */}
          <aside
            aria-label="Decision"
            className={cn(
              "flex flex-col lg:min-h-0 lg:border-l lg:border-line",
              !(selected && task && team) && "hidden lg:flex",
            )}
          >
            {selected && task && team && projection ? (
              <>
                <div
                  ref={decisionScrollRef}
                  className="flex flex-col gap-6 py-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-5"
                >
                  <TaskBrief
                    task={task}
                    description={description}
                    answerText={task.kind === "answer" ? selected.text : null}
                    descriptionOpen={descriptionOpen}
                    onDescriptionToggle={setDescriptionOpen}
                    taskHref={taskHrefBase ? `${taskHrefBase}${task.id}` : null}
                    headerClassName="hidden lg:flex"
                  />
                  <div className="border-t border-line pt-5">
                    <PointsField
                      task={task}
                      team={team}
                      teams={data.teams}
                      projection={projection}
                      draft={draft}
                      onDraft={onDraftOpen}
                      error={fieldError?.id === selected.id ? fieldError : null}
                      valueRef={valueRef}
                      overrideRef={overrideRef}
                      showKeys={singleKeys}
                      approveOnEnter={!readOnly}
                    />
                  </div>
                  <SubmissionHistory
                    entries={selected.history}
                    teamName={team.name}
                    task={task}
                    huntId={huntId}
                    serverNow={serverNow}
                  />
                  <div className="hidden lg:block">
                    <FeedbackField
                      templates={templates}
                      value={draft.feedback}
                      onChange={onFeedbackOpen}
                      onInsert={onInsertOpen}
                      textareaRef={feedbackRef}
                      showKeys={singleKeys}
                      settingsHref={settingsHref}
                      error={
                        fieldError?.id === selected.id && fieldError.field === "feedback" ? fieldError.message : null
                      }
                    />
                  </div>
                  {draft.feedback ? (
                    <div className="rounded-lg bg-mist px-4 py-3 lg:hidden">
                      <p className="text-sm font-semibold">Your feedback</p>
                      <p className="mt-1 text-ink-2">{draft.feedback}</p>
                    </div>
                  ) : null}
                  <Button variant="quiet" className="self-start lg:hidden" onClick={skip}>
                    <SkipForward aria-hidden />
                    Skip for now
                  </Button>
                </div>

                <footer className="hidden shrink-0 flex-col gap-2 border-t border-line bg-paper p-4 lg:flex">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="px-3"
                      onClick={() => void decide("reject")}
                      disabled={readOnly}
                      aria-keyshortcuts={singleKeys ? "R" : undefined}
                    >
                      <StatusGlyph status="rejected" className="size-4 text-danger" />
                      Reject
                      {singleKeys ? <KeyHint k="R" /> : null}
                    </Button>
                    <Button
                      size="lg"
                      className="px-3"
                      onClick={() => void decide("approve")}
                      disabled={readOnly}
                      aria-keyshortcuts={singleKeys ? "A Control+Enter Meta+Enter" : "Control+Enter Meta+Enter"}
                    >
                      Approve
                      {approveDelta != null ? (
                        <span className="font-bib text-lg">{formatSigned(approveDelta)}</span>
                      ) : null}
                      {singleKeys ? (
                        <KeyHint k="A" kbdClassName="border-transparent bg-accent-ink/20 text-accent-ink" />
                      ) : null}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={skip} aria-keyshortcuts={singleKeys ? "S" : undefined}>
                      <SkipForward aria-hidden />
                      Skip for now
                      {singleKeys ? <KeyHint k="S" /> : null}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setSheet("shortcuts")}
                      className="flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-ink-2 hover:bg-mist hover:text-ink"
                    >
                      {singleKeys ? "All shortcuts" : "Keyboard shortcuts"}
                      {singleKeys ? <KeyHint k="?" /> : null}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="hidden p-5 lg:block">
                <RecentDecisions
                  decisions={data.recent.slice(0, 5)}
                  tasks={data.tasks}
                  teams={data.teams}
                  huntId={huntId}
                  serverNow={serverNow}
                  onReopen={(id) => void reopen(id)}
                  reopening={reopening}
                  disabled={readOnly}
                />
              </div>
            )}
          </aside>
        </div>

        {/* Phone action bar, within thumb reach */}
        {selected && task && team ? (
          <div
            data-bottom-bar
            className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:left-64 lg:hidden"
          >
            <div className="mx-auto flex max-w-xl gap-2">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1 px-3"
                onClick={() => void decide("reject")}
                disabled={readOnly}
              >
                <StatusGlyph status="rejected" className="size-4 text-danger" />
                Reject
              </Button>
              <Button
                variant="quiet"
                size="lg"
                className="relative px-4"
                onClick={() => setSheet("feedback")}
                aria-label={draft.feedback ? "Edit feedback" : "Add feedback"}
              >
                <MessageSquareText aria-hidden />
                {draft.feedback ? (
                  <span
                    aria-hidden
                    className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-accent ring-2 ring-mist"
                  />
                ) : null}
              </Button>
              <Button size="lg" className="flex-[1.4] px-3" onClick={() => void decide("approve")} disabled={readOnly}>
                Approve
                {approveDelta != null ? <span className="font-bib text-lg">{formatSigned(approveDelta)}</span> : null}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {sheets}
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  compact,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  compact: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", compact && "w-36 xl:w-44 2xl:w-52")}>
      <label htmlFor={id} className={cn("text-sm font-semibold", compact && "sr-only")}>
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(compact && "h-10 text-sm")}
      >
        {options.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ArchivedNotice({ settingsHref, className }: { settingsHref: string | null; className?: string }) {
  return (
    <Notice tone="warning" title="This hunt is archived" className={cn("mb-3", className)}>
      Results are read-only.{" "}
      {settingsHref ? (
        <>
          Restore the hunt in{" "}
          <Link href={settingsHref} className="font-semibold underline">
            settings
          </Link>{" "}
          to change decisions.
        </>
      ) : (
        "An organizer can restore it to change decisions."
      )}
    </Notice>
  );
}
