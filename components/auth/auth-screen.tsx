import Link from "next/link";
import type { ReactNode } from "react";
import { Mascot } from "@/components/ui/mascot";
import { cn } from "@/lib/utils";
import { CourseMap } from "./course-map";

/**
 * Frame for the staff entrance pages: the form in a readable column, and on
 * wide screens a course map beside it with a note on a paper plate. On phones
 * the note follows the form instead.
 */
export function AuthScreen({
  title,
  description,
  children,
  note,
  mapSeed = "staff-entrance",
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Short, useful aside (e.g. "Here to play?"). */
  note?: ReactNode;
  mapSeed?: string;
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-8 pb-16 outline-none md:pt-14 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-16"
    >
      <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
        <h1 className="font-cond text-4xl font-extrabold tracking-tight text-balance break-words sm:text-5xl">
          {title}
        </h1>
        {description ? <div className="mt-3 text-ink-2">{description}</div> : null}
        <div className="mt-8">{children}</div>
        {note ? <div className="mt-10 rounded-lg bg-mist p-5 lg:hidden">{note}</div> : null}
      </div>
      <CourseMap seed={mapSeed} className="hidden min-h-[36rem] lg:block">
        {note}
      </CourseMap>
    </main>
  );
}

/** "Here to play?" — sends players who land on a staff page to the hunt code entry. */
export function PlayerNote({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-4", className)}>
      <Mascot size={56} />
      <div className="min-w-0">
        <p className="font-semibold">Here to play?</p>
        <p className="mt-0.5 text-sm text-ink-2">
          Teams don't need an account. Join with the six-digit hunt code from your organizer.
        </p>
        <Link
          href="/"
          className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Enter a hunt code
        </Link>
      </div>
    </div>
  );
}

/** A note with the mascot and free content. */
export function MascotNote({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <Mascot size={56} />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-sm text-ink-2">{children}</div>
      </div>
    </div>
  );
}

/** Secondary links under an auth form ("New here? Create an account"). */
export function AuthLinks({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col gap-2 text-sm text-ink-2">{children}</div>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
    >
      {children}
    </Link>
  );
}
