import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth/access";

/** Organizers only. Checked here, outside the loading boundary, so judges get a real 404. */
export default async function OrganizerOnlyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ huntId: string }>;
}) {
  const { huntId } = await params;
  await requireStaff(huntId, "organizer");
  return children;
}
