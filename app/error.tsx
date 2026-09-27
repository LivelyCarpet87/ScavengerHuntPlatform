"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/control";
import { Mascot } from "@/components/ui/mascot";

/**
 * Something failed while rendering a page. "Try again" re-fetches and
 * re-renders it (most failures here are a dropped connection or a busy
 * server); the reference helps an organizer find the error in the server log.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line pt-safe">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <Link href="/" aria-label="Home" className="-m-2 grid size-11 place-items-center rounded-md">
            <LogoMark size={26} />
          </Link>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex max-w-md flex-col items-center px-4 pt-14 pb-20 text-center outline-none"
      >
        <Mascot size={112} />
        <h1 className="mt-6 font-cond text-5xl font-extrabold tracking-tight">This page didn't load</h1>
        <p className="mt-3 text-ink-2">
          Something went wrong on our side, or the connection dropped. Try again in a moment.
        </p>
        <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button size="lg" onClick={() => retry()}>
            <RotateCw aria-hidden />
            Try again
          </Button>
          <ButtonLink href="/" size="lg" variant="secondary">
            Go to the home page
          </ButtonLink>
        </div>
        {error.digest ? (
          <p className="mt-10 text-sm text-ink-2">
            Still broken? Tell the organizer this reference:{" "}
            <span className="font-semibold text-ink">{error.digest}</span>
          </p>
        ) : null}
      </main>
    </div>
  );
}
