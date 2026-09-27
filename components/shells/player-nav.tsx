"use client";

import { Bell, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function ControlGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.25" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  );
}

function tabsFor(slug: string) {
  const base = `/h/${slug}`;
  return [
    {
      href: base,
      label: "Tasks",
      icon: ControlGlyph,
      match: (p: string) => p === base || p.startsWith(`${base}/tasks`),
    },
    {
      href: `${base}/scoreboard`,
      label: "Scores",
      icon: Trophy,
      match: (p: string) => p.startsWith(`${base}/scoreboard`),
    },
    { href: `${base}/team`, label: "Team", icon: Users, match: (p: string) => p.startsWith(`${base}/team`) },
    { href: `${base}/updates`, label: "Updates", icon: Bell, match: (p: string) => p.startsWith(`${base}/updates`) },
  ];
}

/** Bottom tab bar for players on phones. */
export function PlayerBottomNav({ slug, unread = 0 }: { slug: string; unread?: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hunt"
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-safe backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {tabsFor(slug).map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-ink-2",
                  active && "text-accent",
                )}
              >
                <span className="relative">
                  <Icon className="size-6" aria-hidden />
                  {tab.label === "Updates" && unread > 0 ? (
                    <span
                      aria-hidden
                      className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-bib text-[0.65rem] leading-none text-danger-ink"
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </span>
                {tab.label}
                {tab.label === "Updates" && unread > 0 ? <span className="sr-only">, {unread} unread</span> : null}
                {active ? <span aria-hidden className="absolute top-0 h-[3px] w-10 rounded-b-full bg-accent" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The same tabs as a row in the header on wider screens. */
export function PlayerTopTabs({ slug, unread = 0 }: { slug: string; unread?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hunt" className="hidden md:block">
      <ul className="flex gap-1">
        {tabsFor(slug).map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 items-center gap-2 px-3 text-sm font-semibold text-ink-2 hover:text-ink",
                  active &&
                    "text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-accent",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {tab.label}
                {tab.label === "Updates" && unread > 0 ? (
                  <>
                    <span aria-hidden className="rounded-full bg-danger px-1.5 font-bib text-xs text-danger-ink">
                      {unread}
                    </span>
                    <span className="sr-only">, {unread} unread</span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
