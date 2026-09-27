"use client";

import { ShieldUser, UserPlus } from "lucide-react";
import { useCallback, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { formatDate, plural } from "@/lib/format";
import type { AdminUserRow } from "@/lib/platform/admin";
import { initials } from "@/lib/platform/rules";
import { cn } from "@/lib/utils";
import { UserDialog } from "./user-dialog";

const COLUMNS = "md:grid md:grid-cols-[minmax(0,1fr)_10rem_6rem_8rem_7rem] md:items-center md:gap-4";

export function AdminBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-overprint-wash py-0.5 pr-2.5 pl-2 text-xs font-semibold text-overprint",
        className,
      )}
    >
      <ShieldUser aria-hidden className="size-3.5" />
      Platform admin
    </span>
  );
}

export function UsersList({ users, meId }: { users: AdminUserRow[]; meId: string }) {
  const [query, setQuery] = useState("");
  // The row being managed. Kept as a snapshot so the dialog outlives the refresh that
  // removes a deleted account from the list, long enough to confirm the deletion.
  const [managing, setManaging] = useState<AdminUserRow | null>(null);
  const close = useCallback(() => setManaging(null), []);

  const adminCount = users.filter((u) => u.isAdmin).length;
  const q = query.trim().toLowerCase();
  const shown = q ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : users;
  const current = managing ? (users.find((u) => u.id === managing.id) ?? managing) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-2">
          {plural(users.length, "account")}, {plural(adminCount, "platform admin")}
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {users.length > 6 ? (
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find by name or email"
              aria-label="Find a user by name or email"
              className="h-11 sm:w-64"
            />
          ) : null}
          <ButtonLink href="/admin/settings#invites" variant="secondary">
            <UserPlus aria-hidden />
            Invite an organizer
          </ButtonLink>
        </div>
      </div>

      <div
        className={cn("mt-6 hidden border-b border-line pb-2 text-sm font-semibold text-ink-2", COLUMNS)}
        aria-hidden
      >
        <span>Name</span>
        <span>Access</span>
        <span className="text-right">Hunts staffed</span>
        <span>Joined</span>
        <span />
      </div>
      <ul className="divide-y divide-line border-b border-line md:border-b-0">
        {shown.map((u) => {
          const isMe = u.id === meId;
          return (
            <li key={u.id} className={cn("flex items-start gap-3 py-4", COLUMNS)}>
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-mist text-sm font-semibold text-ink-2"
                >
                  {initials(u.name)}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 font-semibold">
                    <span className="truncate">{u.name}</span>
                    {isMe ? (
                      <span className="rounded-full bg-mist-2 px-2 py-0.5 text-xs font-semibold text-ink-2">You</span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-ink-2">{u.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2 md:hidden">
                    {u.isAdmin ? <AdminBadge /> : null}
                    <span>Staff on {plural(u.huntsStaffed, "hunt")}</span>
                    <span>Joined {formatDate(u.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div className="hidden md:block">
                {u.isAdmin ? <AdminBadge /> : <span className="text-sm text-ink-2">Hunt staff</span>}
              </div>
              <span className="hidden text-right font-bib text-xl md:block">{u.huntsStaffed}</span>
              <time dateTime={u.createdAt.toISOString()} className="hidden text-sm text-ink-2 md:block">
                {formatDate(u.createdAt)}
              </time>
              <div className="md:text-right">
                <Button variant="quiet" onClick={() => setManaging(u)}>
                  Manage<span className="sr-only"> {u.name}</span>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? <p className="py-8 text-center text-ink-2">No one matches “{query.trim()}”.</p> : null}

      {current ? <UserDialog user={current} meId={meId} adminCount={adminCount} onClose={close} /> : null}
    </div>
  );
}
