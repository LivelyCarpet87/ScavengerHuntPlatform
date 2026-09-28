"use client";

import { RotateCw } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

/** Reloads the current address — on the offline page that's the page the person actually wanted. */
export function ReloadButton({ children = "Try again", ...props }: Omit<ComponentProps<typeof Button>, "onClick">) {
  return (
    <Button {...props} onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      {children}
    </Button>
  );
}
