"use client";

import { Link2, Trash, UserMinus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/choice";
import { CopyButton } from "@/components/ui/copy-button";
import { RelativeTime } from "@/components/ui/countdown";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import type { StaffRole } from "@/lib/db/schema";
import { formLevel } from "@/lib/staff/forms";
import {
  changeStaffRoleAction,
  createInviteAction,
  removeStaffAction,
  revokeInviteAction,
} from "@/lib/staff/staff-actions";
import { ConfirmAction } from "../confirm-action";
import { useActionForm } from "../use-action-form";

const ROLE_LABEL: Record<StaffRole, string> = { owner: "Owner", organizer: "Organizer", judge: "Judge" };
const ROLE_HINT: Record<StaffRole, string> = {
  judge: "Reviews submissions and sees teams and scores.",
  organizer: "Everything a judge can do, plus tasks, teams, announcements and settings.",
  owner: "Everything, including managing owners, resetting and deleting the hunt.",
};

export type StaffMember = { userId: string; name: string; email: string; role: StaffRole; addedAt: number };
export type ActiveInvite = {
  id: string;
  url: string;
  role: StaffRole;
  createdAt: number;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  byName: string | null;
};

/** The people who run the hunt: roles, removal, and invite links for new ones. */
export function StaffSection({
  huntId,
  me,
  myRole,
  isAdmin,
  members,
  invites,
  serverNow,
}: {
  huntId: string;
  me: string;
  myRole: StaffRole;
  isAdmin: boolean;
  members: StaffMember[];
  invites: ActiveInvite[];
  serverNow: number;
}) {
  const ownerCount = members.filter((m) => m.role === "owner").length;
  return (
    <div className="flex flex-col gap-8">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {members.map((m) => (
          <StaffRow
            key={m.userId}
            huntId={huntId}
            member={m}
            isMe={m.userId === me}
            myRole={myRole}
            lastOwner={m.role === "owner" && ownerCount <= 1}
          />
        ))}
      </ul>
      {isAdmin && !members.some((m) => m.userId === me) ? (
        <p className="-mt-5 text-sm text-ink-2">You’re not on this list: platform admins can manage every hunt.</p>
      ) : null}
      <InviteCreator huntId={huntId} myRole={myRole} />
      {invites.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">Active invite links</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {invites.map((inv) => (
              <InviteRow key={inv.id} huntId={huntId} invite={inv} serverNow={serverNow} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StaffRow({
  huntId,
  member,
  isMe,
  myRole,
  lastOwner,
}: {
  huntId: string;
  member: StaffMember;
  isMe: boolean;
  myRole: StaffRole;
  lastOwner: boolean;
}) {
  const ids = useId();
  const [role, setRole] = useState<StaffRole>(member.role);
  const { state, pending, onSubmit, formRef } = useActionForm(changeStaffRoleAction, {
    onSuccess: (s) => {
      if (s?.ok && s.message) toast({ title: s.message, tone: "success" });
    },
  });
  // Only owners manage owners; nobody can demote or remove the last owner.
  const canManage = (myRole === "owner" || member.role !== "owner") && !lastOwner;
  const roles: StaffRole[] = myRole === "owner" ? ["owner", "organizer", "judge"] : ["organizer", "judge"];

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex items-center gap-2 font-semibold">
          <span className="truncate">{member.name}</span>
          {isMe ? <span className="shrink-0 rounded-full bg-mist-2 px-2 py-0.5 text-xs font-semibold">You</span> : null}
        </p>
        <p className="truncate text-sm text-ink-2">{member.email}</p>
      </div>
      {canManage ? (
        <form ref={formRef} onSubmit={onSubmit} className="flex items-center gap-2">
          <input type="hidden" name="huntId" value={huntId} />
          <input type="hidden" name="userId" value={member.userId} />
          <label htmlFor={`${ids}-role`} className="sr-only">
            Role for {member.name}
          </label>
          <div className="w-36">
            <Select
              id={`${ids}-role`}
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="h-10 text-sm"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          {role !== member.role ? (
            <Button type="submit" size="sm" variant="secondary" pending={pending} className="h-10">
              Change role
            </Button>
          ) : null}
        </form>
      ) : (
        <p className="text-sm font-semibold">
          {ROLE_LABEL[member.role]}
          {lastOwner ? <span className="block text-xs font-normal text-ink-2">The only owner</span> : null}
        </p>
      )}
      {canManage ? (
        <ConfirmAction
          action={removeStaffAction}
          fields={{ huntId, userId: member.userId }}
          label={<span className="sr-only">Remove {member.name}</span>}
          icon={<UserMinus aria-hidden />}
          variant="ghost"
          size="icon"
          className="text-danger"
          title={isMe ? "Leave this hunt?" : `Remove ${member.name}?`}
          description={
            isMe
              ? "You lose access to this hunt straight away. Another organizer can invite you back."
              : `${member.name} loses access to this hunt straight away. Their past decisions stay in the record.`
          }
          confirmLabel={isMe ? "Leave hunt" : "Remove from staff"}
        />
      ) : null}
      {state && !state.ok ? <FormMessage state={state} className="basis-full" /> : null}
    </li>
  );
}

function InviteCreator({ huntId, myRole }: { huntId: string; myRole: StaffRole }) {
  const [role, setRole] = useState<StaffRole>("judge");
  const [created, setCreated] = useState<string | null>(null);
  const { state, pending, onSubmit, formRef } = useActionForm<{ url: string }>(createInviteAction, {
    onSuccess: (s) => {
      if (s?.ok && s.data?.url) setCreated(s.data.url);
    },
  });
  const roles: StaffRole[] = myRole === "owner" ? ["judge", "organizer", "owner"] : ["judge", "organizer"];

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-mist p-4 sm:p-5">
      <div>
        <h3 className="font-semibold">Invite someone</h3>
        <p className="text-sm text-ink-2">
          Create a link and send it however you like. Whoever opens it signs in (or creates an account) and joins the
          staff.
        </p>
      </div>
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="huntId" value={huntId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Role</legend>
          <Segmented
            name="role"
            defaultValue="judge"
            onChange={(v) => setRole(v as StaffRole)}
            className="self-start bg-paper"
            options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
          <p className="text-sm text-ink-2" aria-live="polite">
            {ROLE_HINT[role]}
          </p>
        </fieldset>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Link expires">
            {(p) => (
              <Select {...p} name="expires" defaultValue="7" className="bg-paper">
                <option value="1">In 1 day</option>
                <option value="7">In 7 days</option>
                <option value="30">In 30 days</option>
                <option value="never">Never</option>
              </Select>
            )}
          </Field>
          <Field label="Maximum uses" hint="Leave empty for no limit." error={fieldError(state, "maxUses")}>
            {(p) => <Input {...p} name="maxUses" inputMode="numeric" placeholder="Unlimited" className="bg-paper" />}
          </Field>
        </div>
        {state && !state.ok ? <FormMessage state={formLevel(state, ["maxUses"])} /> : null}
        <Button type="submit" variant="secondary" pending={pending} className="self-start">
          <Link2 aria-hidden />
          Create invite link
        </Button>
      </form>
      {created ? (
        <div
          className="flex flex-col gap-2 rounded-md bg-paper p-3 shadow-[inset_0_0_0_2px_var(--forest)]"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-forest">Invite link ready</p>
          <p className="text-sm break-all select-all">{created}</p>
          <CopyButton value={created} label="Copy invite link" copiedLabel="Copied" className="self-start" />
        </div>
      ) : null}
    </div>
  );
}

function InviteRow({ huntId, invite, serverNow }: { huntId: string; invite: ActiveInvite; serverNow: number }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-semibold">{ROLE_LABEL[invite.role]} invite</p>
        <p className="text-sm text-ink-2">
          {invite.expiresAt ? (
            <>
              Expires <RelativeTime at={invite.expiresAt} serverNow={serverNow} />
            </>
          ) : (
            "Never expires"
          )}
          {", "}
          {invite.maxUses
            ? `used ${invite.uses} of ${invite.maxUses} ${invite.maxUses === 1 ? "time" : "times"}`
            : `used ${invite.uses} ${invite.uses === 1 ? "time" : "times"}`}
          {invite.byName ? `, created by ${invite.byName}` : ""}
        </p>
      </div>
      <CopyButton value={invite.url} label="Copy link" />
      <ConfirmAction
        action={revokeInviteAction}
        fields={{ huntId, inviteId: invite.id }}
        label={
          <>
            Revoke<span className="sr-only"> {ROLE_LABEL[invite.role].toLowerCase()} invite</span>
          </>
        }
        icon={<Trash aria-hidden />}
        variant="ghost"
        size="sm"
        className="text-danger"
        title="Revoke this invite link?"
        description="The link stops working immediately. People who already joined keep their access."
        confirmLabel="Revoke link"
      />
    </li>
  );
}
