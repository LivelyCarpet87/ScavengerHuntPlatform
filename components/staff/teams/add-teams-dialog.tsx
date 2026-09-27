"use client";

import { Plus, Printer } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { addTeamsAction, type CreatedTeams } from "@/lib/staff/team-actions";
import { useActionForm } from "../use-action-form";

/**
 * Bulk-create teams from a list of names (one per line). Afterwards it offers
 * the team cards for exactly the teams it created.
 */
export function AddTeamsDialog({
  huntId,
  placement = "inline",
  showTrigger = true,
}: {
  huntId: string;
  /** "responsive": a full-width bar at the bottom of phones (thumb reach), inline from md up. */
  placement?: "inline" | "responsive";
  /** Hide the button (e.g. while an empty state offers its own); `?add=1` still opens the dialog. */
  showTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wantsOpen = searchParams.get("add") === "1";
  useEffect(() => {
    if (wantsOpen) setOpen(true);
  }, [wantsOpen]);
  const [result, setResult] = useState<CreatedTeams | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { state, pending, onSubmit, formRef } = useActionForm<CreatedTeams>(addTeamsAction, {
    resetOnSuccess: true,
    onSuccess: (s) => {
      if (s?.ok && s.data) {
        setResult(s.data);
        setMessage(s.message ?? null);
      }
    },
  });

  const close = () => {
    setOpen(false);
    setResult(null);
    setMessage(null);
    if (wantsOpen) router.replace(pathname, { scroll: false });
  };

  return (
    <>
      {!showTrigger ? null : placement === "responsive" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button onClick={() => setOpen(true)} className="h-14 w-full text-base md:h-11 md:w-auto md:text-[0.9375rem]">
            <Plus aria-hidden />
            Add teams
          </Button>
        </div>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          Add teams
        </Button>
      )}
      <Dialog
        open={open}
        onClose={close}
        title={result ? "Teams added" : "Add teams"}
        description={
          result
            ? undefined
            : "One team name per line. Each team gets a random emoji, color and team code; you can change them later."
        }
      >
        {result ? (
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-ink">{message}</p>
            {result.created.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {result.created.map((t) => (
                  <li key={t.id} className="rounded-full bg-mist px-3 py-1 text-sm font-semibold">
                    {t.name}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm text-ink-2">
              Hand each team its card: scanning the QR puts a phone straight into the right team.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setResult(null)}>
                Add more teams
              </Button>
              <Button variant="secondary" onClick={close}>
                Done
              </Button>
              {result.created.length > 0 ? (
                <ButtonLink
                  href={`/manage/${huntId}/print/teams?ids=${result.created.map((t) => t.id).join(",")}`}
                  onClick={close}
                >
                  <Printer aria-hidden />
                  Print their team cards
                </ButtonLink>
              ) : null}
            </div>
          </div>
        ) : (
          <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
            <input type="hidden" name="huntId" value={huntId} />
            <Field label="Team names" error={fieldError(state, "names")}>
              {(p) => (
                <Textarea
                  {...p}
                  name="names"
                  rows={8}
                  placeholder={"Night Owls\nLake Otters\nRust Buckets"}
                  autoFocus
                  spellCheck={false}
                />
              )}
            </Field>
            {state && !state.ok && state.error !== fieldError(state, "names") ? <FormMessage state={state} /> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" pending={pending}>
                Create teams
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
