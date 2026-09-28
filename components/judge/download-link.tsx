import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { type ButtonSize, type ButtonVariant, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A plain download link styled as a button (exports are files, not pages to navigate to). */
export function DownloadLink({
  href,
  children,
  variant = "secondary",
  size = "md",
  className,
  hint,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Shown after the label in a quieter weight, e.g. the file size. */
  hint?: string;
}) {
  return (
    <a
      href={href}
      download
      className={buttonClass(
        variant,
        size,
        // Long labels (file counts and sizes) wrap instead of pushing the page sideways on phones.
        cn(
          "h-auto min-h-11 max-w-full shrink flex-wrap gap-x-2 gap-y-0 py-2 text-left whitespace-normal",
          size === "sm" && "min-h-9 py-1.5",
          className,
        ),
      )}
    >
      <Download aria-hidden />
      {children}
      {hint ? <span className="font-medium text-ink-2">{hint}</span> : null}
    </a>
  );
}
