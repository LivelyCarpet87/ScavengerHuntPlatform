"use client";

import { ChevronDown, LayoutDashboard, LogOut, Shield } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SignOutForm } from "@/components/auth/sign-out-form";

/**
 * The signed-in organizer's menu in the site header: who you are, admin, sign
 * out. It closes on Esc, on a press outside it, and when keyboard focus moves
 * on past it, so it never covers what has focus.
 */
export function AccountMenu({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    // Tabbing past the last item: close, so the panel doesn't cover what has focus next.
    // (Only when focus lands somewhere else: a click on the panel's own text moves it nowhere.)
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Node && !wrapRef.current?.contains(next)) setOpen(false);
    };
    const wrap = wrapRef.current;
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    wrap?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      wrap?.removeEventListener("focusout", onFocusOut);
    };
  }, [open]);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const item =
    "flex h-11 w-full items-center gap-3 rounded-md px-3 text-[0.9375rem] font-semibold text-ink hover:bg-mist [&_svg]:size-4 [&_svg]:text-ink-2";

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 items-center gap-2 rounded-md pr-2 pl-1.5 hover:bg-mist"
      >
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-ink font-cond text-sm font-extrabold text-paper"
        >
          {initials}
        </span>
        <span className="hidden max-w-44 truncate text-sm font-semibold sm:block">{name}</span>
        <span className="sr-only sm:hidden">Account: {name}</span>
        <ChevronDown aria-hidden className={`size-4 text-ink-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        // A disclosure panel inside the header's "Account" navigation, so that names it.
        <div
          id={panelId}
          className="absolute top-full right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-raised p-2 shadow-pop animate-pop"
        >
          <div className="px-3 pt-2 pb-3">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-sm text-ink-2">{email}</p>
          </div>
          <div className="mb-1 h-px bg-line" />
          <Link href="/dashboard" className={item} onClick={() => setOpen(false)}>
            <LayoutDashboard aria-hidden /> Your hunts
          </Link>
          {isAdmin ? (
            <Link href="/admin" className={item} onClick={() => setOpen(false)}>
              <Shield aria-hidden /> Admin
            </Link>
          ) : null}
          <SignOutForm>
            <button type="submit" className={item}>
              <LogOut aria-hidden /> Sign out
            </button>
          </SignOutForm>
        </div>
      ) : null}
    </div>
  );
}
