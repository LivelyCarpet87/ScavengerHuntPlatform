import { Camera, KeyRound, MapPin, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/shells/site-header";
import { Bib, BibFigure, Numeral, Ordinal } from "@/components/ui/bib";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceCards, Segmented } from "@/components/ui/choice";
import { ContourArt } from "@/components/ui/contour-art";
import { ControlMarker, FinishMark, LogoMark, StartMark } from "@/components/ui/control";
import { CopyButton, ShareButton } from "@/components/ui/copy-button";
import { Countdown } from "@/components/ui/countdown";
import { DateTimeField } from "@/components/ui/datetime-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { Markdown } from "@/components/ui/markdown";
import { Kbd, LiveDot, Notice, PageHeader, Panel } from "@/components/ui/misc";
import { ControlCard, PunchMark } from "@/components/ui/punch";
import { QrCode } from "@/components/ui/qr-code";
import { StatusBadge } from "@/components/ui/status";
import { TeamAvatar, TeamBadge } from "@/components/ui/team-badge";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Style guide" };

const teams = [
  { name: "Night Owls", emoji: "🦉", color: "plum" },
  { name: "Hedgehog Brigade", emoji: "🦔", color: "gold" },
  { name: "Lake Otters", emoji: "🦦", color: "lake" },
];

/** Living reference for the design system (development only). */
export default function StyleguidePage() {
  if (!env.isDev) notFound();
  const now = Date.now();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10">
        <PageHeader
          title="Style guide"
          description="The pieces every screen is built from. Tokens live in app/globals.css; rules in docs/DESIGN.md."
          actions={<Button>Primary action</Button>}
        />

        <section className="relative overflow-hidden rounded-xl border border-line px-6 py-10">
          <ContourArt seed="styleguide" />
          <div className="relative flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <StartMark size={32} />
              <ControlMarker code={31} />
              <ControlMarker code={47} state="pending" />
              <ControlMarker code={52} state="approved" />
              <ControlMarker code={63} state="rejected" />
              <ControlMarker code={70} state="locked" />
              <FinishMark size={32} />
              <LogoMark size={32} />
            </div>
            <h2 className="font-cond text-6xl font-extrabold tracking-tight">Campus Night Hunt</h2>
            <p className="max-w-prose text-lg text-ink-2">
              Find the controls, prove it with a photo, beat the other teams back to the start.
            </p>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Bib className="gap-8">
            <BibFigure value={<Ordinal n={2} />} caption="of 14 teams" />
            <BibFigure value="1,240" caption="points" />
          </Bib>
          <div className="flex flex-col justify-center gap-2">
            <p className="text-sm text-ink-2">Countdown</p>
            <Countdown to={now + 83 * 60_000 + 12_000} serverNow={now} className="text-7xl" />
            <p className="text-ink-2">
              Inline numbers: <Numeral className="text-xl">120</Numeral> points
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-cond text-2xl font-bold">Control card</h2>
          <ControlCard
            cells={[
              { id: "a1", code: 31, title: "Red door", state: "approved" },
              { id: "b2", code: 32, title: "Statue selfie", state: "approved", fresh: true },
              { id: "c3", code: 33, title: "Riddle", state: "pending" },
              { id: "d4", code: 34, title: "Tallest tower", state: "rejected" },
              { id: "e5", code: 35, title: "Checkpoint", state: "todo" },
              { id: "f6", code: 36, title: "Bonus", state: "locked" },
              { id: "g7", code: 37, title: "Another", state: "todo" },
              { id: "h8", code: 38, title: "More", state: "approved" },
            ]}
          />
          <div className="flex gap-4 text-accent">
            <PunchMark seed="x1" size={56} />
            <PunchMark seed="x2" size={56} />
            <PunchMark seed="x3" size={56} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-cond text-2xl font-bold">Buttons</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Submit photo</Button>
            <Button variant="secondary">Scan checkpoint</Button>
            <Button variant="quiet">Reveal hint</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Reject</Button>
            <Button pending>Sending</Button>
            <Button size="lg">
              <Camera /> Take photo
            </Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
            <ButtonLink href="/" variant="quiet">
              Link button
            </ButtonLink>
            <CopyButton value="K7Q M4P" label="Copy code" />
            <ShareButton url="/" title="Join our team" />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-cond text-2xl font-bold">Status and teams</h2>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="pending" />
            <StatusBadge status="approved" />
            <StatusBadge status="rejected" />
            <StatusBadge status="approved" label="Auto-accepted" />
            <LiveDot />
            <Kbd>A</Kbd>
            <Kbd>R</Kbd>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {teams.map((t) => (
              <TeamBadge key={t.name} team={t} />
            ))}
            <TeamAvatar team={teams[1]} size="xl" />
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Panel title="Form controls" description="48px tall, labelled, errors in words.">
            <form className="flex flex-col gap-4">
              <Field label="Team name" hint="Shown on the scoreboard.">
                {(p) => <Input {...p} placeholder="Night Owls" />}
              </Field>
              <Field label="Answer" error="That doesn’t match. Check the spelling and try again.">
                {(p) => <Input {...p} defaultValue="gargoyle" />}
              </Field>
              <Field label="Note for the judges">{(p) => <Textarea {...p} placeholder="Optional" />}</Field>
              <Field label="Ranking">
                {(p) => (
                  <Select {...p} defaultValue="highest">
                    <option value="highest">Highest value wins</option>
                    <option value="lowest">Lowest value wins</option>
                  </Select>
                )}
              </Field>
              <DateTimeField name="startsAt" label="Starts" defaultValue={new Date(now + 86_400_000).toISOString()} />
              <Checkbox label="Accept photos without review" hint="Judges can still reject them later." />
              <Switch label="Registration open" hint="New teams can join with the hunt code." defaultChecked />
              <Segmented
                name="vis"
                defaultValue="players"
                options={[
                  { value: "public", label: "Everyone" },
                  { value: "players", label: "Players" },
                  { value: "staff", label: "Staff" },
                ]}
              />
            </form>
          </Panel>
          <div className="flex flex-col gap-6">
            <ChoiceCards
              name="kind"
              defaultValue="media"
              options={[
                {
                  value: "media",
                  label: "Photo or video",
                  description: "Teams upload proof; you review it.",
                  icon: <Camera className="size-5" />,
                },
                {
                  value: "answer",
                  label: "Answer",
                  description: "Checked automatically against your answers.",
                  icon: <KeyRound className="size-5" />,
                },
                {
                  value: "checkpoint",
                  label: "Checkpoint",
                  description: "Teams scan a QR code you put up.",
                  icon: <MapPin className="size-5" />,
                },
                {
                  value: "contest",
                  label: "Contest",
                  description: "Best entries win placement points.",
                  icon: <Trophy className="size-5" />,
                },
              ]}
            />
            <Notice tone="warning" title="Scoreboard frozen">
              Standings shown as of 20:30. Final results appear when the hunt ends.
            </Notice>
            <Notice tone="info">Push notifications are off on this device.</Notice>
            <div className="flex items-center gap-4">
              <QrCode value="https://example.com/join/482913" size={120} label="QR code for the hunt" />
              <p className="font-bib text-5xl tracking-wide">482 913</p>
            </div>
            <Markdown>
              {
                "**Meet at the fountain** at 18:00.\n\n- Stay in your team\n- Photos must show at least two members\n\nQuestions? [Rules](https://example.com)"
              }
            </Markdown>
          </div>
        </section>

        <EmptyState title="No submissions yet" action={<Button variant="secondary">Open the task list</Button>}>
          When your team sends proof for a task, it shows up here with the judge’s feedback.
        </EmptyState>
      </main>
    </>
  );
}
