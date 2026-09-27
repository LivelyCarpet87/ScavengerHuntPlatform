import type { ReactNode } from "react";
import { PrintTheme } from "@/components/staff/print/print-kit";

/** Printable pages: Day colors always, A4 pages with no browser margins (sheets carry their own). */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PrintTheme />
      <style>{"@page { size: A4 portrait; margin: 0; }"}</style>
      {children}
    </>
  );
}
