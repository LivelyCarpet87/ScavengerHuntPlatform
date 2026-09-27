import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/shells/site-header";
import { ButtonLink } from "@/components/ui/button";
import { ControlMarker } from "@/components/ui/control";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Unknown URLs, and every notFound() without a closer not-found page — which
 * includes hunts you don't have access to (we don't reveal that they exist).
 */
export default function NotFound() {
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col items-center px-4 pt-14 pb-20 text-center">
        <ControlMarker code="404" state="locked" size="xl" label="A control that isn't on this course" />
        <h1 className="mt-6 font-cond text-5xl font-extrabold tracking-tight">This page doesn't exist</h1>
        <p className="mt-3 text-ink-2">
          If you scanned a code, check it's for this hunt. If someone sent you a link, ask them to send it again.
        </p>
        <ButtonLink href="/" size="lg" className="mt-7 w-full sm:w-auto">
          Go to the home page
        </ButtonLink>
        <p className="mt-10 text-sm text-ink-2">
          Helping run a hunt? Its owner needs to invite you before you can open it.{" "}
          <Link
            href="/dashboard"
            className="font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Your hunts
          </Link>
        </p>
      </main>
    </div>
  );
}
