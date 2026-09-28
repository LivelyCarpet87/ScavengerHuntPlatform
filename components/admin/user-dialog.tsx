"use client";

import { Trash } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormMessage, fieldError, SubmitButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import type { AdminUserRow } from "@/lib/platform/admin";
import { deleteUserAction, setAdminAction, setCreatorAction, setPasswordAction } from "@/lib/platform/admin-actions";
import { firstName } from "@/lib/platform/rules";

/*
 * Manage one account: admin rights, a new password, or deletion. Feedback
 * stays inside the dialog (toasts would sit behind the modal); deleting closes
 * it and confirms with a toast.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-5 first:pt-1">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function AdminRights({ user, isMe, onlyAdmin }: { user: AdminUserRow; isMe: boolean; onlyAdmin: boolean }) {
  const [state, action] = useActionState(setAdminAction, null);
  const locked = user.isAdmin && (isMe || onlyAdmin);
  return (
    <Section title="Platform admin">
      <p className="mt-1 text-sm text-ink-2">
        {user.isAdmin
          ? `${isMe ? "You can" : `${firstName(user.name)} can`} see and manage every hunt, every account and the sign-up settings.`
          : "Admins can see and manage every hunt, every account and the sign-up settings."}
      </p>
      {locked ? (
        <p className="mt-3 text-sm font-medium text-ink">
          {isMe
            ? "You can't remove your own admin rights. Another admin can."
            : "This is the only platform admin. Make someone else an admin before removing these rights."}
        </p>
      ) : (
        <form action={action} className="mt-3 flex flex-col items-start gap-3">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="admin" value={user.isAdmin ? "revoke" : "grant"} />
          <SubmitButton variant="secondary" pendingLabel={user.isAdmin ? "Removing" : "Saving"}>
            {user.isAdmin ? "Remove admin rights" : "Make platform admin"}
          </SubmitButton>
        </form>
      )}
      <FormMessage state={state} className="mt-3" />
    </Section>
  );
}

function CreatorRights({ user }: { user: AdminUserRow }) {
  const [state, action] = useActionState(setCreatorAction, null);
  if (user.isAdmin) return null;
  const name = firstName(user.name);
  return (
    <Section title="Creating hunts">
      <p className="mt-1 text-sm text-ink-2">
        {user.canCreateHunts
          ? `${name} can create and run their own hunts.`
          : `${name} works only on the hunts they're invited to. Organizer access lets them create their own.`}
      </p>
      <form action={action} className="mt-3 flex flex-col items-start gap-3">
        <input type="hidden" name="userId" value={user.id} />
        <input type="hidden" name="creator" value={user.canCreateHunts ? "revoke" : "grant"} />
        <SubmitButton variant="secondary" pendingLabel="Saving">
          {user.canCreateHunts ? "Remove organizer access" : "Give organizer access"}
        </SubmitButton>
      </form>
      <FormMessage state={state} className="mt-3" />
    </Section>
  );
}

function NewPassword({ user, isMe }: { user: AdminUserRow; isMe: boolean }) {
  const [state, action] = useActionState(setPasswordAction, null);
  // The field only appears on request: the sheet stays short on phones, and a password
  // manager doesn't offer to fill it while someone is only changing admin rights.
  const [editing, setEditing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);
  useEffect(() => {
    if (editing) formRef.current?.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
  }, [editing]);
  const problem = state && !state.ok && !state.fieldErrors?.password ? state : null;
  return (
    <Section title="Password">
      <p className="mt-1 text-sm text-ink-2">
        {isMe
          ? "A new password keeps you signed in here and signs you out on your other devices."
          : `A new password signs ${firstName(user.name)} out everywhere. Tell them what it is in person or over chat.`}
      </p>
      {editing ? (
        <form ref={formRef} action={action} noValidate className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="userId" value={user.id} />
          <Field label="New password" hint="At least 10 characters." error={fieldError(state, "password")}>
            {(p) => <PasswordInput {...p} name="password" autoComplete="new-password" />}
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="secondary" pendingLabel="Setting password">
              Set password
            </SubmitButton>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <FormMessage state={problem} />
        </form>
      ) : (
        <>
          <Button variant="secondary" className="mt-3" onClick={() => setEditing(true)}>
            Set a new password
          </Button>
          {state?.ok ? <FormMessage state={state} className="mt-3" /> : null}
        </>
      )}
    </Section>
  );
}

function DeleteAccount({ user, onDeleted }: { user: AdminUserRow; onDeleted: () => void }) {
  const [state, action] = useActionState(deleteUserAction, null);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!confirming) return;
    // A scripted smooth scroll ignores the reduced-motion CSS, so ask the setting here.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    confirmRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    confirmRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus({ preventScroll: true });
  }, [confirming]);
  useEffect(() => {
    if (state?.ok) {
      toast({ title: state.message ?? "Account deleted", tone: "success" });
      onDeleted();
    }
  }, [state, onDeleted]);
  const name = firstName(user.name);
  return (
    <Section title="Delete account">
      <p className="mt-1 text-sm text-ink-2">
        Deleting the account removes {name} from every hunt they help run and signs them out. Their judging decisions
        and score adjustments stay.
      </p>
      {user.soleOwnerOf.length > 0 ? (
        <Notice
          tone="warning"
          className="mt-3"
          title={`${name} is the only owner of ${user.soleOwnerOf.length === 1 ? "a hunt" : `${user.soleOwnerOf.length} hunts`}`}
        >
          {user.soleOwnerOf.map((h) => h.name).join(", ")}. Platform admins keep full access to{" "}
          {user.soleOwnerOf.length === 1 ? "it" : "them"} after the account is gone.
        </Notice>
      ) : null}
      {confirming ? (
        <form ref={confirmRef} action={action} className="mt-4 flex flex-col gap-3 rounded-lg bg-danger-wash p-4">
          <input type="hidden" name="userId" value={user.id} />
          <p className="font-semibold">Delete {user.name}'s account? This can't be undone.</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" pendingLabel="Deleting">
              Delete account
            </SubmitButton>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep account
            </Button>
          </div>
          <FormMessage state={state} />
        </form>
      ) : (
        <Button variant="quiet" className="mt-3 text-danger" onClick={() => setConfirming(true)}>
          <Trash aria-hidden />
          Delete account
        </Button>
      )}
    </Section>
  );
}

export function UserDialog({
  user,
  meId,
  adminCount,
  onClose,
}: {
  user: AdminUserRow;
  meId: string;
  adminCount: number;
  onClose: () => void;
}) {
  const isMe = user.id === meId;
  return (
    <Dialog
      open
      onClose={onClose}
      title={<span className="break-words">{isMe ? `${user.name} (you)` : user.name}</span>}
      description={<span className="break-all">{user.email}</span>}
    >
      <div className="flex flex-col divide-y divide-line">
        <AdminRights user={user} isMe={isMe} onlyAdmin={adminCount <= 1} />
        <CreatorRights user={user} />
        <NewPassword user={user} isMe={isMe} />
        {isMe ? null : <DeleteAccount user={user} onDeleted={onClose} />}
      </div>
    </Dialog>
  );
}
