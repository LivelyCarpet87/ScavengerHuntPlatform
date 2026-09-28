"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide toggle — typing a 10+ character password
 * on a phone keyboard is much easier when you can check it.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-14", className)}
      />
      {/* A toggle: the name stays "Show password" and aria-pressed says whether it's on. */}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label="Show password"
        title="Show password"
        className="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center rounded-md text-ink-2 hover:text-ink"
      >
        {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
}
