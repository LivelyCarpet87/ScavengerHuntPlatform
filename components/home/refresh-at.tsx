"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MAX_TIMEOUT = 2_147_000_000;

/**
 * Re-renders the page when a moment passes — the hunt starting or ending, a
 * task unlocking — so phones left open flip to the new state on their own.
 * Pass the moments as epoch milliseconds; past ones are ignored.
 */
export function RefreshAt({ at }: { at: (number | null | undefined)[] }) {
  const router = useRouter();
  const [fired, setFired] = useState(0);
  const key = at
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b)
    .join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `fired` re-arms the timer for the next moment
  useEffect(() => {
    const now = Date.now();
    const next = key
      .split(",")
      .map(Number)
      .find((t) => Number.isFinite(t) && t > now);
    if (next == null) return;
    // A little after the boundary, so the server agrees the moment has passed.
    const timer = setTimeout(
      () => {
        setFired((n) => n + 1);
        router.refresh();
      },
      Math.min(next - now + 1200, MAX_TIMEOUT),
    );
    return () => clearTimeout(timer);
  }, [key, router, fired]);

  return null;
}
