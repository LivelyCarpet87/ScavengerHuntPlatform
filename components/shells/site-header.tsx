import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/control";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

/** Header for public, auth and dashboard pages (outside a specific hunt). */
export function SiteHeader({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <header className={cn("border-b border-line pt-safe", className)}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={26} />
          <span className="font-cond text-xl font-extrabold tracking-tight">{env.appName}</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">{children}</nav>
      </div>
    </header>
  );
}
