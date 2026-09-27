import { LogOut } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/lib/auth/actions";
import type { User } from "@/lib/db/schema";
import { initials } from "@/lib/platform/rules";
import { cn } from "@/lib/utils";

/**
 * Right side of the SiteHeader for signed-in staff: quick links, who is
 * signed in, and sign out. Links that point at the current section can be
 * hidden with `hide`.
 *
 *   <SiteHeader><AccountNav user={user} /></SiteHeader>
 */
export function AccountNav({
  user,
  hide = [],
  className,
}: {
  user: Pick<User, "name" | "email" | "isAdmin">;
  hide?: ("hunts" | "admin")[];
  className?: string;
}) {
  const link =
    "inline-flex h-11 items-center rounded-md px-3 text-sm font-semibold text-ink-2 hover:bg-mist hover:text-ink";
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {!hide.includes("hunts") ? (
        <Link href="/dashboard" className={link}>
          Your hunts
        </Link>
      ) : null}
      {user.isAdmin && !hide.includes("admin") ? (
        <Link href="/admin" className={link}>
          Admin
        </Link>
      ) : null}
      <span
        className="ml-1 hidden size-9 place-items-center rounded-full bg-mist font-semibold text-ink-2 text-sm sm:grid"
        title={`${user.name} (${user.email})`}
        aria-hidden
      >
        {initials(user.name)}
      </span>
      <form action={signOutAction}>
        <button
          type="submit"
          className="grid size-11 place-items-center rounded-md text-ink-2 hover:bg-mist hover:text-ink"
          aria-label="Sign out"
          title={`Sign out ${user.name}`}
        >
          <LogOut aria-hidden className="size-5" />
        </button>
      </form>
    </div>
  );
}
