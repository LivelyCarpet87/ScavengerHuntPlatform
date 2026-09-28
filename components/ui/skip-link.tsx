"use client";

/**
 * The first stop for keyboard users on every page: jumps past the header and
 * navigation to the page's main content (<main id="main">, or the first
 * <main> or heading on pages without one).
 */
export function SkipLink() {
  return (
    // biome-ignore lint/a11y/useValidAnchor: in-page navigation; the handler focuses the target (without adding #main to the URL) and finds one on pages whose <main> has no id
    <a
      href="#main"
      onClick={(e) => {
        const target =
          document.getElementById("main") ?? document.querySelector("main") ?? document.querySelector("h1");
        if (!target) return;
        e.preventDefault();
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-[calc(var(--banner-h)+0.5rem)] focus:left-2 focus:z-[80] focus:rounded-md focus:bg-paper focus:px-4 focus:py-3 focus:font-semibold focus:text-ink focus:shadow-pop"
    >
      Skip to content
    </a>
  );
}
