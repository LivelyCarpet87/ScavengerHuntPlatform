import "server-only";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

/** Runs statements atomically in one transaction (libSQL batch). Empty lists are a no-op. */
export async function runBatch(items: BatchItem<"sqlite">[]): Promise<void> {
  if (items.length === 0) return;
  await db.batch(items as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

/** Re-renders every organizer page of a hunt (and the dashboard) after a change. */
export function revalidateHunt(huntId: string) {
  revalidatePath(`/manage/${huntId}`, "layout");
  revalidatePath("/dashboard");
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
