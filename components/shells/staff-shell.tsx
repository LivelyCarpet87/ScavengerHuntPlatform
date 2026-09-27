import { ArrowLeft, LogOut, MonitorPlay, Smartphone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StaffLive } from "@/components/live/staff-live";
import { LogoMark } from "@/components/ui/control";
import { signOutAction } from "@/lib/auth/actions";
import type { Hunt, StaffRole, User } from "@/lib/db/schema";
import { huntPhase } from "@/lib/hunts";
import { cn } from "@/lib/utils";
import { StaffMobileMenu, StaffSideNav } from "./staff-nav";

const phaseLabel = {
  draft: "Draft",
  upcoming: "Scheduled",
  live: "Live",
  ended: "Finished",
  archived: "Archived",
} as const;

export function HuntPhaseChip({
  hunt,
  className,
}: {
  hunt: Pick<Hunt, "status" | "startsAt" | "endsAt">;
  className?: string;
}) {
  const phase = huntPhase(hunt);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        phase === "live" && "bg-danger-wash text-danger",
        phase === "draft" && "bg-mist-2 text-ink-2",
        phase === "upcoming" && "bg-water-wash text-water",
        (phase === "ended" || phase === "archived") && "bg-mist-2 text-ink-2",
        className,
      )}
    >
      {phase === "live" ? <span aria-hidden className="size-1.5 rounded-full bg-danger animate-live" /> : null}
      {phaseLabel[phase]}
    </span>
  );
}

function ShellFooter({ hunt, user }: { hunt: Pick<Hunt, "slug">; user: Pick<User, "name" | "email"> }) {
  return (
    <div className="flex flex-col gap-1">
      <Link
        href={`/h/${hunt.slug}`}
        className="flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-ink-2 hover:bg-mist-2 hover:text-ink"
      >
        <Smartphone className="size-4" aria-hidden /> Player view
      </Link>
      <Link
        href={`/h/${hunt.slug}/screen`}
        target="_blank"
        className="flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-ink-2 hover:bg-mist-2 hover:text-ink"
      >
        <MonitorPlay className="size-4" aria-hidden /> Big screen
      </Link>
      <div className="mt-3 flex items-center gap-2 border-t border-line px-3 pt-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-ink-3">{user.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-mist-2 hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Frame for organizer/judge pages (/manage/[huntId]/…): sidebar navigation on
 * desktop, a header menu on phones.
 */
export function StaffShell({
  hunt,
  role,
  user,
  pending,
  children,
}: {
  hunt: Pick<Hunt, "id" | "name" | "slug" | "status" | "startsAt" | "endsAt" | "accent">;
  role: StaffRole;
  user: Pick<User, "name" | "email">;
  /** Submissions waiting for review. */
  pending: number;
  children: ReactNode;
}) {
  return (
    <div data-accent={hunt.accent} className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-mist px-3 py-4 md:flex">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-3 text-sm font-semibold text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All hunts
        </Link>
        <div className="mt-4 mb-5 px-3">
          <p className="font-cond text-2xl leading-tight font-extrabold tracking-tight">{hunt.name}</p>
          <HuntPhaseChip hunt={hunt} className="mt-2" />
        </div>
        <StaffSideNav huntId={hunt.id} role={role} pending={pending} />
        <div className="mt-auto">
          <ShellFooter hunt={hunt} user={user} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-paper/95 px-2 pt-safe backdrop-blur md:hidden">
          <Link
            href="/dashboard"
            className="grid size-11 place-items-center rounded-md hover:bg-mist"
            aria-label="All hunts"
          >
            <LogoMark size={24} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-cond text-lg leading-tight font-extrabold">{hunt.name}</p>
          </div>
          <HuntPhaseChip hunt={hunt} />
          <StaffMobileMenu
            huntId={hunt.id}
            role={role}
            pending={pending}
            footer={<ShellFooter hunt={hunt} user={user} />}
          />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
        <StaffLive huntId={hunt.id} />
      </div>
    </div>
  );
}
