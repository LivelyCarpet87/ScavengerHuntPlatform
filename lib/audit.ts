import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/**
 * Records a staff action so organizers can answer "who changed this score?".
 * Action names are dotted verbs: "submission.approve", "adjustment.create",
 * "team.rename", "task.update", "hunt.publish", …
 */
export async function audit(entry: {
  huntId: string | null;
  actorUserId: string | null;
  action: string;
  targetKind?: string;
  targetId?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLog).values({
    huntId: entry.huntId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetKind: entry.targetKind ?? null,
    targetId: entry.targetId ?? null,
    data: entry.data ?? null,
  });
}
