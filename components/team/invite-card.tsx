import { CopyButton, ShareButton } from "@/components/ui/copy-button";
import { QrCode } from "@/components/ui/qr-code";
import type { Hunt, Team } from "@/lib/db/schema";
import { formatCode } from "@/lib/ids";
import { absoluteUrl, links } from "@/lib/url";
import { cn } from "@/lib/utils";

/**
 * The team's invite: its code in big numerals, a QR of the invite link, and
 * share/copy buttons. Teammates scan it, open the link, or type the code.
 */
export async function InviteCard({
  hunt,
  team,
  hint = "Teammates scan the QR code, open your invite link, or type the code under “Join a team”.",
  className,
}: {
  hunt: Pick<Hunt, "slug" | "name">;
  team: Pick<Team, "name" | "code">;
  /** How teammates use it (under the code). */
  hint?: string;
  className?: string;
}) {
  const path = links.teamInvite(hunt.slug, team.code);
  const url = await absoluteUrl(path);
  const code = formatCode(team.code);
  return (
    <div
      className={cn(
        "flex flex-col gap-5 rounded-xl border border-line bg-paper p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-2">Team code</p>
        <p className="mt-1 font-bib text-6xl leading-none tracking-[0.04em] sm:text-7xl">{code}</p>
        <p className="mt-3 max-w-xs text-sm text-ink-2">{hint}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ShareButton
            url={path}
            title={`Join ${team.name}`}
            text={`Join ${team.name} in ${hunt.name}. Team code ${code}.`}
            label="Share invite link"
          />
          <CopyButton value={code} label="Copy code" size="md" />
        </div>
      </div>
      <QrCode
        value={url}
        size={176}
        label={`QR code that opens the invite to ${team.name}`}
        className="shrink-0 self-center border border-line sm:self-auto"
      />
    </div>
  );
}
