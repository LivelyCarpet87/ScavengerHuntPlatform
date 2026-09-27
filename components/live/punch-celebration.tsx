"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ControlMarker } from "@/components/ui/control";
import { PunchMark } from "@/components/ui/punch";
import { formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";

// One celebration per task: the checkpoint page and the live event for the
// same accepted task can both ask for it within a few seconds.
const recent = new Map<string, number>();
const DEDUPE_MS = 15_000;

function claimCelebration(seed: string): boolean {
  const now = Date.now();
  for (const [key, at] of recent) if (now - at > DEDUPE_MS) recent.delete(key);
  if (recent.has(seed)) return false;
  recent.set(seed, now);
  return true;
}

type Status = "pending" | "show" | "leaving" | "gone";

/**
 * "Punched!" — the product's one celebratory moment, shown when a task is
 * accepted: the control marker fills in, the task's own pin-punch pattern
 * punches through a control-card box, and the points land. About 1.8 s,
 * then it gets out of the way. Tap or Esc dismisses early. With reduced
 * motion it is the same result without the movement.
 *
 *   <PunchCelebration code={36} title="Name a constellation" points={120} seed={task.id} />
 *
 * `seed` is the task id (the same seed as the team's control card). A task
 * celebrates once: a second request within 15 s (e.g. the checkpoint page
 * and the live event) renders nothing and calls onDone right away.
 */
export function PunchCelebration({
  code,
  title,
  points,
  seed,
  durationMs = 1800,
  onDone,
}: {
  code?: number | string | null;
  title: string;
  points?: number | null;
  seed: string;
  durationMs?: number;
  /** Called after it closes (on its own, by tap or by Esc). */
  onDone?: () => void;
}) {
  const [status, setStatus] = useState<Status>("pending");
  const [punching, setPunching] = useState(false);
  const claimed = useRef<boolean | null>(null);
  const solid = useRef<HTMLSpanElement>(null);
  const figures = useRef<HTMLSpanElement>(null);
  const finish = useEffectEvent(() => onDone?.());
  const shown = status === "show" || status === "leaving";

  useEffect(() => {
    // A ref survives React's dev double-invocation of effects.
    claimed.current ??= claimCelebration(seed);
    if (claimed.current) {
      setStatus((s) => (s === "pending" ? "show" : s));
    } else {
      setStatus("gone");
      finish();
    }
  }, [seed]);

  // Choreography: the marker fills (120–500 ms), the holes punch in (from
  // 420 ms), the points land (560 ms). Reduced motion shows the end state.
  useEffect(() => {
    if (!shown) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (solid.current) solid.current.style.clipPath = "none";
      setPunching(true);
      return;
    }
    const fill = solid.current?.animate(
      [{ clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(71% at 50% 50%)" }],
      { duration: 380, delay: 120, easing: "cubic-bezier(0.3, 1.3, 0.5, 1)", fill: "both" },
    );
    const land = figures.current?.animate(
      [
        { opacity: 0, transform: "translateY(10px) scale(0.96)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 280, delay: 560, easing: "cubic-bezier(0.2, 1.2, 0.4, 1)", fill: "both" },
    );
    const t = setTimeout(() => setPunching(true), 420);
    return () => {
      clearTimeout(t);
      fill?.cancel();
      land?.cancel();
    };
  }, [shown]);

  useEffect(() => {
    if (status !== "show") return;
    const t = setTimeout(() => setStatus("leaving"), durationMs);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStatus("leaving");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [status, durationMs]);

  useEffect(() => {
    if (status !== "leaving") return;
    const t = setTimeout(() => {
      setStatus("gone");
      finish();
    }, 200);
    return () => clearTimeout(t);
  }, [status]);

  if (!shown) return null;
  const hasPoints = points != null && points !== 0;
  const announcement = `Punched! ${title}${hasPoints ? `, ${formatSigned(points)} points` : ""}.`;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] transition-opacity duration-200",
        status === "leaving" ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    >
      {/* role="alert" is announced when it appears, even with its text already in place. */}
      <p role="alert" className="sr-only">
        {announcement}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setStatus("leaving")}
        className="grid size-full cursor-default place-items-center bg-paper/95 px-6 animate-pop focus-visible:outline-none"
      >
        <span aria-hidden className="flex flex-col items-center text-center">
          <span className="flex items-center gap-5">
            <span className="grid">
              <ControlMarker code={code ?? ""} state="todo" size="xl" className="[grid-area:1/1]" />
              <span ref={solid} className="[grid-area:1/1]" style={{ clipPath: "circle(0% at 50% 50%)" }}>
                <ControlMarker code={code ?? ""} state="approved" size="xl" />
              </span>
            </span>
            <span className="relative grid size-28 place-items-center rounded-md border-[3px] border-accent bg-accent-wash text-accent">
              {code != null ? (
                <span className="absolute top-1.5 left-2 font-bib text-base leading-none">{code}</span>
              ) : null}
              {punching ? <PunchMark seed={seed} size={84} animate /> : null}
            </span>
          </span>
          <span ref={figures} className="mt-8 flex flex-col items-center">
            <span className="font-cond text-5xl font-extrabold tracking-tight text-ink">Punched!</span>
            {hasPoints ? (
              <span className="mt-2 font-bib text-8xl leading-none text-accent">{formatSigned(points)}</span>
            ) : null}
            <span className="mt-3 max-w-xs text-lg font-semibold text-balance text-ink">{title}</span>
          </span>
        </span>
      </button>
    </div>
  );
}
