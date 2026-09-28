import { and, count, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/shells/staff-shell";
import { requireStaff } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";

export default async function ManageLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ huntId: string }>;
}) {
  const { huntId } = await params;
  const { hunt, role, user } = await requireStaff(huntId, "judge");
  const pending =
    (
      await db
        .select({ n: count() })
        .from(submissions)
        .where(and(eq(submissions.huntId, huntId), eq(submissions.status, "pending")))
        .get()
    )?.n ?? 0;

  return (
    <StaffShell hunt={hunt} role={role} user={user} pending={pending}>
      {children}
    </StaffShell>
  );
}
