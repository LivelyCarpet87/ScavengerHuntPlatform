import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/access";

/**
 * Signed-out visitors are sent to sign in before anything streams (a real
 * redirect, not a client one). Each dashboard route has its own guard, so the
 * login page can send people back to the exact page they asked for.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireUser("/dashboard");
  return children;
}
