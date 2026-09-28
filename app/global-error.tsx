"use client";

import "./globals.css";
import { useEffect } from "react";

/**
 * Last-resort error page for when the root layout itself fails. It replaces
 * the whole document, so it brings its own <html>, styles and title, and uses
 * nothing that could fail the same way.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper font-sans text-ink">
        <title>Something went wrong</title>
        <main className="mx-auto flex max-w-md flex-col items-center px-4 pt-20 pb-20 text-center">
          <svg viewBox="0 0 100 100" width={96} height={96} aria-hidden className="shrink-0">
            <circle cx="50" cy="50" r="43" fill="none" stroke="var(--danger)" strokeWidth="6" />
            <line x1="20" y1="80" x2="80" y2="20" stroke="var(--danger)" strokeWidth="6" strokeLinecap="round" />
          </svg>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight">The app didn't load</h1>
          <p className="mt-3 text-ink-2">
            Something went wrong on our side, or the connection dropped. Try again in a moment.
          </p>
          <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-14 items-center justify-center rounded-md bg-accent px-6 font-semibold text-accent-ink"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="inline-flex h-14 items-center justify-center rounded-md px-6 font-semibold text-ink shadow-[inset_0_0_0_2px_var(--ink)]"
            >
              Go to the home page
            </button>
          </div>
          {error.digest ? (
            <p className="mt-10 text-sm text-ink-2">
              Still broken? Tell the organizer this reference:{" "}
              <span className="font-semibold text-ink">{error.digest}</span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
