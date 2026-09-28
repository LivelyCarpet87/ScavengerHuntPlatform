import type { Metadata } from "next";
import { PrintToolbar } from "@/components/staff/print/print-kit";
import { Sheet, SheetStack } from "@/components/staff/print/sheet";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QrCode } from "@/components/ui/qr-code";
import { requireStaff } from "@/lib/auth/access";
import { formatCode } from "@/lib/ids";
import { teamColorHex } from "@/lib/palette";
import { staffTitle } from "@/lib/staff/metadata";
import { listTeams } from "@/lib/staff/queries";
import { absoluteUrl, links } from "@/lib/url";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ huntId: string }> }): Promise<Metadata> {
  return staffTitle((await params).huntId, "Team cards");
}

const PER_SHEET = 8;
const PIN_HOLES = [
  "top-[2.2cqw] left-[2.2cqw]",
  "top-[2.2cqw] right-[2.2cqw]",
  "bottom-[2.2cqw] left-[2.2cqw]",
  "bottom-[2.2cqw] right-[2.2cqw]",
];

export default async function TeamCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt } = await requireStaff(huntId, "judge");
  const all = await listTeams(hunt.id);
  const wanted = sp.ids ? new Set(sp.ids.split(",").filter(Boolean)) : null;
  // Everyone by default (test teams only when asked for by id).
  const teams = wanted ? all.filter((t) => wanted.has(t.id)) : all.filter((t) => !t.hidden);
  const urls = await Promise.all(teams.map((t) => absoluteUrl(links.teamInvite(hunt.slug, t.code))));
  const cards = teams.map((team, i) => ({ team, url: urls[i] }));
  const sheets: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += PER_SHEET) sheets.push(cards.slice(i, i + PER_SHEET));

  return (
    <>
      <PrintToolbar
        huntId={hunt.id}
        what="team_cards"
        title="Team cards"
        summary={
          teams.length === 0
            ? "A card for each team with its code and a QR code that puts a phone straight into the team."
            : `${teams.length} ${teams.length === 1 ? "card" : "cards"}, eight to a page. Cut along the dashed lines and hand one to each team: scanning it joins the team.`
        }
        backHref={`/manage/${hunt.id}/teams`}
        backLabel="All teams"
        tip="Print on A4 at 100% scale (“Actual size”). In color, each emoji ring shows the team’s color."
      >
        {wanted && all.length > teams.length ? (
          <ButtonLink href={`/manage/${hunt.id}/print/teams`} variant="secondary" size="lg">
            Cards for every team
          </ButtonLink>
        ) : null}
      </PrintToolbar>

      {teams.length === 0 ? (
        <EmptyState
          title="No teams to print yet"
          action={<ButtonLink href={`/manage/${hunt.id}/teams`}>Go to teams</ButtonLink>}
        >
          Add teams on the Teams page, then print their cards to hand out at the start.
        </EmptyState>
      ) : (
        <SheetStack>
          {sheets.map((sheet, s) => (
            <Sheet key={sheet[0].team.id} label={`Team cards, page ${s + 1}`}>
              <ul className="grid h-full grid-cols-2 grid-rows-4">
                {sheet.map(({ team, url }, i) => {
                  const hex = teamColorHex(team.color);
                  return (
                    <li
                      key={team.id}
                      className={cn(
                        "relative flex min-h-0 min-w-0 gap-[3cqw] border-dashed border-line-strong px-[4.5cqw] py-[3.6cqw]",
                        i % 2 === 0 && "border-r-[0.25cqw]",
                        i < 6 && "border-b-[0.25cqw]",
                      )}
                    >
                      {PIN_HOLES.map((pos) => (
                        <span
                          key={pos}
                          aria-hidden
                          className={cn("absolute size-[1.4cqw] rounded-full border-[0.25cqw] border-ink-3", pos)}
                        />
                      ))}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <p className="truncate text-[1.9cqw] text-ink-2">{hunt.name}</p>
                        <span
                          aria-hidden
                          className="mt-[1.4cqw] grid size-[6cqw] shrink-0 place-items-center rounded-full text-[3.4cqw] leading-none"
                          style={{ border: `0.45cqw solid ${hex}` }}
                        >
                          {team.emoji}
                        </span>
                        <p className="mt-[1.2cqw] line-clamp-2 font-cond text-[3.4cqw] leading-none font-extrabold tracking-tight">
                          {team.name}
                        </p>
                        <div className="mt-auto pt-[1cqw]">
                          <p className="text-[1.9cqw] text-ink-2">Team code</p>
                          <p className="font-bib text-[5.4cqw] leading-none tracking-wide whitespace-nowrap">
                            {formatCode(team.code)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-center justify-center gap-[1.2cqw]">
                        <QrCode
                          value={url}
                          size={320}
                          label={`QR code to join ${team.name}`}
                          className="size-[17cqw]"
                        />
                        <p className="text-center text-[1.9cqw] leading-tight text-ink-2">
                          Scan to join
                          <br />
                          your team
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Sheet>
          ))}
        </SheetStack>
      )}
    </>
  );
}
