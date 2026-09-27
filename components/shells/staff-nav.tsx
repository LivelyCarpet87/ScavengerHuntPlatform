"use client";

import { Gavel, Inbox, LayoutDashboard, ListChecks, Megaphone, Menu, Settings, Trophy, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { StaffRole } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: typeof Gavel; exact?: boolean; count?: number; min: StaffRole };

const RANK: Record<StaffRole, number> = { judge: 1, organizer: 2, owner: 3 };

export function staffNavItems(huntId: string, pending: number): Item[] {
  const base = `/manage/${huntId}`;
  return [
    { href: base, label: "Overview", icon: LayoutDashboard, exact: true, min: "judge" },
    { href: `${base}/judge`, label: "Judge", icon: Gavel, count: pending, min: "judge" },
    { href: `${base}/submissions`, label: "Submissions", icon: Inbox, min: "judge" },
    { href: `${base}/tasks`, label: "Tasks", icon: ListChecks, min: "organizer" },
    { href: `${base}/teams`, label: "Teams", icon: Users, min: "judge" },
    { href: `${base}/scoreboard`, label: "Scoreboard", icon: Trophy, min: "judge" },
    { href: `${base}/announcements`, label: "Announcements", icon: Megaphone, min: "organizer" },
    { href: `${base}/settings`, label: "Settings", icon: Settings, min: "organizer" },
  ];
}

function useItems(huntId: string, role: StaffRole, pending: number) {
  return staffNavItems(huntId, pending).filter((i) => RANK[role] >= RANK[i.min]);
}

function NavList({
  huntId,
  role,
  pending,
  onNavigate,
}: {
  huntId: string;
  role: StaffRole;
  pending: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = useItems(huntId, role, pending);
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-semibold text-ink-2 transition-colors hover:bg-mist-2 hover:text-ink",
                active && "bg-paper text-ink shadow-[inset_3px_0_0_var(--accent)]",
              )}
            >
              <Icon className={cn("size-[1.1rem]", active && "text-accent")} aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.count ? (
                <span className="rounded-full bg-sun px-2 py-0.5 font-bib text-sm leading-none text-sun-ink">
                  {item.count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function StaffSideNav(props: { huntId: string; role: StaffRole; pending: number }) {
  return <NavList {...props} />;
}

/** Phone header menu: a sheet with the same navigation. */
export function StaffMobileMenu({
  huntId,
  role,
  pending,
  footer,
}: {
  huntId: string;
  role: StaffRole;
  pending: number;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Close when navigating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname change is the trigger
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="relative grid size-11 place-items-center rounded-md hover:bg-mist"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
        {!open && pending > 0 ? (
          <span className="absolute top-2 right-2 size-2.5 rounded-full bg-sun ring-2 ring-paper" />
        ) : null}
      </button>
      {open ? (
        <div className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] bottom-0 z-50 overflow-y-auto border-t border-line bg-mist px-3 py-4 animate-pop">
          <NavList huntId={huntId} role={role} pending={pending} onNavigate={() => setOpen(false)} />
          {footer ? <div className="mt-6 border-t border-line pt-4">{footer}</div> : null}
        </div>
      ) : null}
    </>
  );
}
