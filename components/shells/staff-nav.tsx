"use client";

import {
  Gavel,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Menu,
  Settings,
  Trophy,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { StaffRole } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: typeof Gavel;
  exact?: boolean;
  /** Other pages that belong to this section (print sheets, sub-pages outside its path). */
  also?: string[];
  count?: number;
  min: StaffRole;
};

const RANK: Record<StaffRole, number> = { judge: 1, organizer: 2, owner: 3 };

export function staffNavItems(huntId: string, pending: number): Item[] {
  const base = `/manage/${huntId}`;
  return [
    { href: base, label: "Overview", icon: LayoutDashboard, exact: true, also: [`${base}/print/poster`], min: "judge" },
    { href: `${base}/judge`, label: "Judge", icon: Gavel, count: pending, min: "judge" },
    { href: `${base}/submissions`, label: "Submissions", icon: Inbox, min: "judge" },
    { href: `${base}/tasks`, label: "Tasks", icon: ListChecks, also: [`${base}/print/checkpoints`], min: "organizer" },
    { href: `${base}/teams`, label: "Teams", icon: Users, also: [`${base}/print/teams`], min: "judge" },
    { href: `${base}/scoreboard`, label: "Scoreboard", icon: Trophy, min: "judge" },
    { href: `${base}/announcements`, label: "Announcements", icon: Megaphone, min: "organizer" },
    { href: `${base}/activity`, label: "Activity", icon: History, min: "organizer" },
    { href: `${base}/settings`, label: "Settings", icon: Settings, min: "organizer" },
  ];
}

const within = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function isActive(item: Item, pathname: string): boolean {
  if (item.also?.some((href) => within(pathname, href))) return true;
  return item.exact ? pathname === item.href : within(pathname, item.href);
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
  const items = staffNavItems(huntId, pending).filter((i) => RANK[role] >= RANK[i.min]);
  return (
    <nav aria-label="Hunt sections">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-semibold text-ink-2 transition-colors hover:bg-mist-2 hover:text-ink md:h-10",
                  active && "bg-paper text-ink shadow-[inset_3px_0_0_var(--accent)]",
                )}
              >
                <Icon className={cn("size-[1.1rem]", active && "text-accent")} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.count ? (
                  <span className="rounded-full bg-sun px-2 py-0.5 font-bib text-sm leading-none text-sun-ink">
                    {item.count}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function StaffSideNav(props: { huntId: string; role: StaffRole; pending: number }) {
  return <NavList {...props} />;
}

/**
 * Phone header menu: a modal sheet with the same navigation. It mirrors the
 * header row (`bar`) with a close button where the menu button was, so the
 * menu button turns into ✕, and the page behind is inert while it's open.
 */
export function StaffMobileMenu({
  huntId,
  role,
  pending,
  bar,
  footer,
}: {
  huntId: string;
  role: StaffRole;
  pending: number;
  /** The phone header's content (left of the menu button), repeated at the top of the open menu. */
  bar?: ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const id = useId();

  // Close when navigating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname change is the trigger
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Start on the current section rather than the first link in the bar.
      el.querySelector<HTMLElement>('nav [aria-current="page"]')?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  // The phone header disappears from md up; an open modal would be left behind, invisible.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 48rem)");
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={pending > 0 ? `Open menu, ${pending} waiting to judge` : "Open menu"}
        className="relative grid size-11 shrink-0 place-items-center rounded-md hover:bg-mist"
      >
        <Menu className="size-5" aria-hidden />
        {pending > 0 ? (
          <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-sun ring-2 ring-paper" />
        ) : null}
      </button>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a tap outside the sheet closes it; Esc closes natively */}
      <dialog
        ref={dialog}
        id={id}
        aria-label="Menu"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-0 mt-(--banner-h) h-[calc(100dvh-var(--banner-h))] max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-mist p-0 text-ink backdrop:bg-transparent"
      >
        <div className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-paper px-2 pt-safe">
          {bar}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-mist"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-pop">
          <NavList huntId={huntId} role={role} pending={pending} onNavigate={() => setOpen(false)} />
          {footer ? <div className="mt-6 border-t border-line pt-4">{footer}</div> : null}
        </div>
      </dialog>
    </>
  );
}
