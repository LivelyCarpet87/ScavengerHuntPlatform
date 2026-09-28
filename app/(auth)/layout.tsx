import type { ReactNode } from "react";
import { SiteHeader } from "@/components/shells/site-header";

/** Staff entrance: sign in, first-run setup, sign up and invite links. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      {children}
    </div>
  );
}
