"use client";

import { Crown, EllipsisVertical, SmartphoneNfc, UserMinus } from "lucide-react";
import { useActionState, useState } from "react";
import { toastTitle } from "@/components/join/form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/actions";
import { removeMember, signOutMember, transferCaptain } from "@/lib/player/actions";
import { MemberIdentity } from "./member-identity";
import { useActionDone } from "./use-action-done";

export type MemberView = {
  id: string;
  name: string;
  isCaptain: boolean;
  /** Signed in on some device (the session id itself never reaches the browser). */
  signedIn: boolean;
};

type ActionKey = "captain" | "signout" | "remove";

/**
 * The team's members. The captain gets a sheet per member to hand over the
 * captaincy, sign a lost device out, or remove them — each with a confirm step.
 */
export function MemberList({
  huntId,
  members,
  meId,
  canManage,
}: {
  huntId: string;
  members: MemberView[];
  meId: string;
  /** The viewer is captain and the team can still change. */
  canManage: boolean;
}) {
  const [target, setTarget] = useState<MemberView | null>(null);
  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {members.map((m) => (
          <li key={m.id} className="flex min-h-16 items-center gap-2 py-2.5">
            <MemberIdentity member={m} isMe={m.id === meId} />
            {canManage && m.id !== meId ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Manage ${m.name}`}
                onClick={() => setTarget(m)}
                className="text-ink-2"
              >
                <EllipsisVertical />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <Dialog open={!!target} onClose={() => setTarget(null)} title={target?.name ?? ""}>
        {target ? (
          <MemberActions key={target.id} huntId={huntId} member={target} onDone={() => setTarget(null)} />
        ) : null}
      </Dialog>
    </>
  );
}

function MemberActions({ huntId, member, onDone }: { huntId: string; member: MemberView; onDone: () => void }) {
  const [confirming, setConfirming] = useState<ActionKey | null>(null);

  if (confirming) {
    return (
      <ConfirmAction
        huntId={huntId}
        member={member}
        which={confirming}
        onBack={() => setConfirming(null)}
        onDone={onDone}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-1 pb-2">
      {member.signedIn ? (
        <li>
          <ActionRow
            icon={<Crown />}
            title={`Make ${member.name} captain`}
            detail="The captain edits the team and manages members."
            onClick={() => setConfirming("captain")}
          />
        </li>
      ) : (
        <li className="flex items-start gap-3 py-3 text-sm text-ink-2 [&_svg]:size-5">
          <Crown aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {member.name} isn’t signed in on any device. Once they pick their name again from the team invite, you can
            make them captain.
          </span>
        </li>
      )}
      {member.signedIn ? (
        <li>
          <ActionRow
            icon={<SmartphoneNfc />}
            title={`Sign ${member.name} out of their device`}
            detail="For a lost phone or a cleared browser. They pick their name again from the team invite."
            onClick={() => setConfirming("signout")}
          />
        </li>
      ) : null}
      <li>
        <ActionRow
          icon={<UserMinus />}
          title={`Remove ${member.name} from the team`}
          detail="Everything the team has scored stays."
          danger
          onClick={() => setConfirming("remove")}
        />
      </li>
    </ul>
  );
}

function ActionRow({
  icon,
  title,
  detail,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-mist [&_svg]:size-5"
    >
      <span className={danger ? "mt-0.5 text-danger" : "mt-0.5 text-ink-2"}>{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className={danger ? "font-semibold text-danger" : "font-semibold"}>{title}</span>
        <span className="text-sm text-ink-2">{detail}</span>
      </span>
    </button>
  );
}

const CONFIRM: Record<
  ActionKey,
  {
    action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
    question: (name: string) => string;
    detail: (name: string) => string;
    button: (name: string) => string;
    pending: string;
    danger?: boolean;
  }
> = {
  captain: {
    action: transferCaptain,
    question: (n) => `Make ${n} the captain?`,
    detail: (n) => `You’ll no longer be able to edit the team or manage members. Only ${n} can hand it back.`,
    button: (n) => `Make ${n} captain`,
    pending: "Handing over",
  },
  signout: {
    action: signOutMember,
    question: (n) => `Sign ${n} out of their device?`,
    detail: (n) =>
      `${n} stays on the team. On their new phone, they open the team invite and pick their name under “Already on this team?”.`,
    button: (n) => `Sign ${n} out`,
    pending: "Signing out",
  },
  remove: {
    action: removeMember,
    question: (n) => `Remove ${n} from the team?`,
    detail: (n) =>
      `${n}’s phone leaves the team. Everything the team has scored stays. They could rejoin with the team code.`,
    button: (n) => `Remove ${n}`,
    pending: "Removing",
    danger: true,
  },
};

function ConfirmAction({
  huntId,
  member,
  which,
  onBack,
  onDone,
}: {
  huntId: string;
  member: MemberView;
  which: ActionKey;
  onBack: () => void;
  onDone: () => void;
}) {
  const copy = CONFIRM[which];
  const [state, action] = useActionState<ActionState, FormData>(copy.action, null);
  useActionDone(state, (message) => {
    toast({ title: toastTitle(message, "Done"), tone: "success" });
    onDone();
  });
  return (
    <form action={action} className="flex flex-col gap-4 pb-2">
      <input type="hidden" name="huntId" value={huntId} />
      <input type="hidden" name="playerId" value={member.id} />
      <div>
        <p className="font-semibold">{copy.question(member.name)}</p>
        <p className="mt-1 text-sm text-ink-2">{copy.detail(member.name)}</p>
      </div>
      <FormMessage state={state?.ok ? null : state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant={copy.danger ? "danger" : "primary"} pendingLabel={copy.pending}>
          {copy.button(member.name)}
        </SubmitButton>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
