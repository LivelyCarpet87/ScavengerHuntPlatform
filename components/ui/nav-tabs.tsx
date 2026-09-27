"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NavTab = {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Small count shown after the label (e.g. pending submissions). */
  count?: number;
  /** Match only this exact path (default: prefix match). */
  exact?: boolean;
};

export function isActive(pathname: string, tab: Pick<NavTab, "href" | "exact">) {
  return tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/** Horizontal section tabs with an accent underline for the current one. Scrolls sideways on small screens. */
export function NavTabs({ tabs, className }: { tabs: NavTab[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("-mx-4 overflow-x-auto px-4 [scrollbar-width:none]", className)}>
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-2 px-3 text-sm font-semibold text-ink-2 transition-colors hover:text-ink",
                  active &&
                    "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-accent",
                )}
              >
                {tab.icon}
                {tab.label}
                {tab.count ? (
                  <span className="rounded-full bg-sun px-1.5 py-0.5 font-bib text-xs leading-none text-sun-ink">
                    {tab.count}
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
