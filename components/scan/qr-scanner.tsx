"use client";

// CONTRACT STUB — implemented by the tasks & submissions area.
// Keep the exported names and props; replace the body.

import { ScanLine } from "lucide-react";
import { type ButtonSize, type ButtonVariant, buttonClass } from "@/components/ui/button";

export type QrScanButtonProps = {
  /**
   * Called with each decoded QR text. Return true when handled (the scanner
   * closes), false to keep scanning (e.g. a code from another hunt).
   */
  onResult: (text: string) => boolean | Promise<boolean>;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

/** Button that opens a camera QR scanner in a sheet. */
export function QrScanButton({
  label = "Scan QR code",
  variant = "secondary",
  size = "md",
  className,
}: QrScanButtonProps) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} disabled>
      <ScanLine aria-hidden />
      {label}
    </button>
  );
}
