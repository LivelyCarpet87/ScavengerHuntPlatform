"use client";

import { X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/*
 * Toasts: short confirmations and live results ("Accepted: Red door, +120").
 * Call toast() from any client code. Toasts sit above the bottom tab bar.
 *
 *   toast({ title: "Photo sent", description: "A judge will review it shortly." })
 *   toast({ title: "Not accepted", tone: "danger" })
 */

export type ToastTone = "neutral" | "success" | "danger" | "accent";
export type ToastInput = { title: string; description?: string; tone?: ToastTone; durationMs?: number };
type ToastItem = ToastInput & { id: number };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export function toast(input: ToastInput): number {
  const id = nextId++;
  items = [...items.slice(-3), { ...input, id }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), item.durationMs ?? 4500);
    return () => clearTimeout(t);
  }, [item.durationMs]);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => dismissToast(item.id), 180);
    return () => clearTimeout(t);
  }, [leaving, item.id]);

  const tone = item.tone ?? "neutral";
  return (
    <li
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg bg-raised p-3.5 pl-4 text-ink shadow-pop transition-[opacity,transform] duration-200 animate-pop",
        leaving && "translate-y-2 opacity-0",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2.5 shrink-0 rounded-full",
          tone === "neutral" && "bg-ink-3",
          tone === "success" && "bg-forest",
          tone === "danger" && "bg-danger",
          tone === "accent" && "bg-accent",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.title}</p>
        {item.description ? <p className="mt-0.5 text-sm text-ink-2">{item.description}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => setLeaving(true)}
        className="-m-1 rounded-sm p-1 text-ink-3 hover:text-ink"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

export function Toaster() {
  const list = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--toast-offset)+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-6"
    >
      <ol className="flex w-full max-w-sm flex-col gap-2">
        {list.map((item) => (
          <ToastView key={item.id} item={item} />
        ))}
      </ol>
    </div>
  );
}
