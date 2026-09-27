"use client";

import { Ban, Link2, TimerOff, UserCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton, ShareButton } from "@/components/ui/copy-button";
import { RelativeTime } from "@/components/ui/countdown";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, fieldError, SubmitButton } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/actions";
import { createPlatformInviteAction, revokePlatformInviteAction } from "@/lib/platform/admin-actions";
import { INVITE_LIFETIMES, type InviteStatus } from "@/lib/platform/rules";
import { cn } from "@/lib/utils";

export type InviteLinkRow = {
  id: string;
  url: string;
  status: InviteStatus;
  creatorName: string | null;
  createdAt: number;
  expiresAt: number | null;
  uses: number;
  maxUses: number | null;
};

const STATUS: Record<InviteStatus, { label: string; icon: typeof Link2; className: string }> = {
  active: { label: "Active", icon: Link2, className: "bg-forest-wash text-forest" },
  used: { label: "Used up", icon: UserCheck, className: "bg-mist-2 text-ink-2" },
  expired: { label: "Expired", icon: TimerOff, className: "bg-mist-2 text-ink-2" },
  revoked: { label: "Turned off", icon: Ban, className: "bg-mist-2 text-ink-2" },
};

function StatusChip({ status }: { status: InviteStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-xs font-semibold",
        s.className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {s.label}
    </span>
  );
}

function usesText(row: InviteLinkRow): string {
  if (row.maxUses != null) return `Used ${row.uses} of ${row.maxUses} ${row.maxUses === 1 ? "time" : "times"}`;
  if (row.uses === 0) return "Not used yet";
  return `Used ${row.uses} ${row.uses === 1 ? "time" : "times"}`;
}

/** Same words as a hunt's staff invites: "Turn off link", confirmed first. */
function RevokeButton({
  id,
  action,
  result,
}: {
  id: string;
  action: (formData: FormData) => void;
  /** The list's latest "turn off" result: whatever it says, the question has been answered. */
  result: ActionState;
}) {
  const [open, setOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new result closes the dialog
  useEffect(() => setOpen(false), [result]);
  return (
    <>
      <Button variant="ghost" className="text-danger" onClick={() => setOpen(true)}>
        <Ban aria-hidden />
        Turn off link
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Turn off this invite link?"
        description="The link stops working right away. People who already used it keep their access."
      >
        {/* The result is shown by the list: once turned off, this row moves to "Past links". */}
        <form action={action} className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
          <input type="hidden" name="inviteId" value={id} />
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton variant="danger" pendingLabel="Turning off">
            Turn off link
          </SubmitButton>
        </form>
      </Dialog>
    </>
  );
}

function InviteRow({
  row,
  serverNow,
  revoke,
  revoked,
}: {
  row: InviteLinkRow;
  serverNow: number;
  revoke: (formData: FormData) => void;
  revoked: ActionState;
}) {
  const active = row.status === "active";
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={row.status} />
          <span className={cn("min-w-0 truncate text-sm", active ? "font-semibold text-ink" : "text-ink-2")}>
            {row.url.replace(/^https?:\/\//, "")}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          <span>
            Created by {row.creatorName ?? "a deleted account"},{" "}
            <RelativeTime at={row.createdAt} serverNow={serverNow} />
          </span>
          <span>{usesText(row)}</span>
          {active ? (
            row.expiresAt ? (
              <span>
                Stops working <RelativeTime at={row.expiresAt} serverNow={serverNow} />
              </span>
            ) : (
              <span>Never expires</span>
            )
          ) : row.status === "expired" && row.expiresAt ? (
            <span>
              Stopped working <RelativeTime at={row.expiresAt} serverNow={serverNow} />
            </span>
          ) : null}
        </div>
      </div>
      {active ? (
        <div className="flex flex-wrap gap-2">
          <CopyButton value={row.url} label="Copy link" variant="quiet" size="md" />
          <RevokeButton id={row.id} action={revoke} result={revoked} />
        </div>
      ) : null}
    </li>
  );
}

export function InviteLinks({ invites, serverNow }: { invites: InviteLinkRow[]; serverNow: number }) {
  const [state, action] = useActionState(createPlatformInviteAction, null);
  // Kept here rather than in each row: a link that's turned off moves to "Past links",
  // and a row-level result would vanish with the row before it could be shown.
  const [revoked, revoke] = useActionState(revokePlatformInviteAction, null);
  useEffect(() => {
    if (!revoked) return;
    toast(
      revoked.ok
        ? { title: "Invite link turned off", description: "Anyone who has it can no longer use it.", tone: "success" }
        : { title: "Couldn't turn off the link", description: revoked.error, tone: "danger" },
    );
  }, [revoked]);
  const createdUrl = state?.ok ? state.data?.url : undefined;
  // Only while that link is still usable (it may have been turned off since).
  const created =
    createdUrl && invites.some((i) => i.url === createdUrl && i.status === "active") ? createdUrl : undefined;
  const createdRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (created) createdRef.current?.focus();
  }, [created]);

  const active = invites.filter((i) => i.status === "active");
  const past = invites.filter((i) => i.status !== "active");

  return (
    <div className="flex flex-col gap-6">
      <form
        action={action}
        noValidate
        className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <Field label="Link stops working" error={fieldError(state, "lifetime")}>
          {(p) => (
            <Select {...p} name="lifetime" defaultValue="7d">
              {INVITE_LIFETIMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Maximum uses" error={fieldError(state, "maxUses")}>
          {(p) => (
            <Input {...p} name="maxUses" type="number" inputMode="numeric" min={1} max={1000} placeholder="No limit" />
          )}
        </Field>
        <SubmitButton pendingLabel="Creating link" className="h-12">
          Create invite link
        </SubmitButton>
      </form>

      {created ? (
        <div ref={createdRef} tabIndex={-1} className="rounded-lg bg-sun-wash p-4 outline-none">
          <p className="font-semibold">New invite link</p>
          <p className="mt-0.5 text-sm text-ink-2">
            Send it to the person you're inviting. Anyone with the link can create an organizer account until it stops
            working.
          </p>
          <p className="mt-3 rounded-md bg-paper px-3 py-2.5 text-sm font-medium break-all">{created}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton value={created} label="Copy link" variant="primary" size="md" />
            <ShareButton url={created} title="Organizer invite" text="Create your organizer account" label="Share" />
          </div>
        </div>
      ) : state && !state.ok && !state.fieldErrors ? (
        <FormMessage state={state} />
      ) : null}

      <div>
        <h3 className="font-semibold">{active.length > 0 ? "Active links" : "No active links"}</h3>
        {active.length > 0 ? (
          <ul className="divide-y divide-line">
            {active.map((row) => (
              <InviteRow key={row.id} row={row} serverNow={serverNow} revoke={revoke} revoked={revoked} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-2">
            Create a link above when someone needs an organizer account. Hunt organizers invite their own judges from
            their hunt's settings.
          </p>
        )}
      </div>

      {past.length > 0 ? (
        <details className="group">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-2 font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 transition-transform group-open:rotate-90">
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Past links ({past.length})
          </summary>
          <ul className="divide-y divide-line">
            {past.map((row) => (
              <InviteRow key={row.id} row={row} serverNow={serverNow} revoke={revoke} revoked={revoked} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
