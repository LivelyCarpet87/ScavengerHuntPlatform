import { and, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { registerJob } from "@/lib/jobs";
import { CLAIM_TTL_MS } from "./constants";

/*
 * Background work for judging, loaded by instrumentation.ts before the
 * scheduler starts. The queue already ignores lapsed claims by their age;
 * this just keeps the claim columns tidy so a judge who closed their laptop
 * mid-review doesn't leave "Sam is reviewing" behind.
 */

export async function releaseStaleClaims(now = Date.now()): Promise<number> {
  const cleared = await db
    .update(submissions)
    .set({ claimedBy: null, claimedAt: null })
    .where(and(isNotNull(submissions.claimedAt), lt(submissions.claimedAt, new Date(now - CLAIM_TTL_MS))))
    .returning({ id: submissions.id });
  return cleared.length;
}

registerJob("judging:release-stale-claims", 30_000, async () => {
  await releaseStaleClaims();
});
