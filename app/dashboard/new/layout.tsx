import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/access";

/** Signed-out visitors are sent to sign in (and back here afterwards) before anything streams. */
export default async function NewHuntLayout({ children }: { children: ReactNode }) {
  await requireUser("/dashboard/new");
  return children;
}
