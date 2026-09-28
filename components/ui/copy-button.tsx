"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { type ButtonSize, type ButtonVariant, buttonClass } from "./button";
import { toast } from "./toast";

/** Copies text to the clipboard and confirms inline. */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "quiet",
  size = "sm",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast({ title: "Couldn’t copy", description: value, tone: "danger" });
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}

/**
 * Opens the phone's share sheet (Web Share API) and falls back to copying
 * the link where sharing isn't available (most desktops).
 */
export function ShareButton({
  url,
  title,
  text,
  label = "Share",
  variant = "secondary",
  size = "md",
  className,
}: {
  url: string;
  title: string;
  text?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      onClick={async () => {
        const absolute = new URL(url, window.location.origin).toString();
        if (navigator.share) {
          try {
            await navigator.share({ url: absolute, title, text });
            return;
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(absolute);
          toast({ title: "Link copied", description: absolute });
        } catch {
          toast({ title: "Share this link", description: absolute });
        }
      }}
    >
      <Share2 aria-hidden />
      {label}
    </button>
  );
}
