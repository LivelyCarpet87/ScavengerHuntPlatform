import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PrintToolbar } from "@/components/staff/print/print-kit";
import { Sheet, SheetStack } from "@/components/staff/print/sheet";
import { ButtonLink } from "@/components/ui/button";
import { ControlMarker } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { QrCode } from "@/components/ui/qr-code";
import { requireStaff } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { formatCode } from "@/lib/ids";
import { absoluteUrl, links } from "@/lib/url";

export const metadata: Metadata = { title: "Checkpoint posters" };

export default async function CheckpointPostersPage({
  params,
  searchParams,
}: {
  params: Promise<{ huntId: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { huntId } = await params;
  const sp = await searchParams;
  const { hunt } = await requireStaff(huntId, "organizer");
  const all = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.huntId, hunt.id), eq(tasks.kind, "checkpoint")))
    .orderBy(asc(tasks.sortOrder), asc(tasks.code));
  const single = sp.task ? all.find((t) => t.id === sp.task) : undefined;
  const list = (single ? [single] : all).filter((t) => t.checkpointCode);
  const urls = await Promise.all(list.map((t) => absoluteUrl(links.checkpoint(hunt.slug, t.checkpointCode as string))));

  return (
    <>
      <PrintToolbar
        huntId={hunt.id}
        what="checkpoints"
        title={single ? `Checkpoint ${single.code} poster` : "Checkpoint posters"}
        summary={
          list.length === 0
            ? "Checkpoint tasks get a poster with a QR code for teams to scan on site."
            : single
              ? "One page. Scanning its QR code counts the checkpoint for the team straight away."
              : `${list.length} ${list.length === 1 ? "page" : "pages"}, one per checkpoint. Scanning a poster’s QR code counts it for the team straight away.`
        }
        backHref={single ? `/manage/${hunt.id}/tasks/${single.id}` : `/manage/${hunt.id}/tasks`}
        backLabel={single ? "Back to the task" : "All tasks"}
        tip="Print on A4 at 100% scale (“Actual size”), in color if you can: the control markers use the hunt’s color."
      >
        {single && all.length > 1 ? (
          <ButtonLink href={`/manage/${hunt.id}/print/checkpoints`} variant="secondary" size="lg">
            All {all.length} posters
          </ButtonLink>
        ) : null}
      </PrintToolbar>

      {list.length === 0 ? (
        <EmptyState
          title="No checkpoint tasks yet"
          action={<ButtonLink href={`/manage/${hunt.id}/tasks/new?kind=checkpoint`}>Add a checkpoint task</ButtonLink>}
        >
          A checkpoint is a task teams complete by scanning a QR code you put up somewhere: a statue, a door, the
          halfway point.
        </EmptyState>
      ) : (
        <SheetStack>
          {list.map((t, i) => (
            <Sheet key={t.id} label={`Poster for checkpoint ${t.code}`}>
              <div data-accent={hunt.accent} className="flex h-full flex-col px-[8cqw] pt-[7cqw] pb-[6cqw]">
                <p className="font-cond text-[3.4cqw] leading-tight font-extrabold">{hunt.name}</p>
                <div className="mt-[5cqw] flex items-center gap-[5cqw]">
                  <ControlMarker
                    code={t.code}
                    size="xl"
                    label={`Control ${t.code}`}
                    className="size-[26cqw] shrink-0"
                  />
                  <h2 className="min-w-0 font-cond text-[7.5cqw] leading-[0.95] font-extrabold tracking-tight text-balance break-words">
                    {t.title}
                  </h2>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center py-[3cqw]">
                  <QrCode
                    value={urls[i]}
                    size={560}
                    label={`QR code for checkpoint ${t.code}`}
                    className="size-[48cqw]"
                  />
                  <p className="mt-[3cqw] font-cond text-[5.4cqw] leading-none font-extrabold">
                    Scan with your phone camera
                  </p>
                </div>
                <div className="flex items-center justify-between gap-[4cqw] rounded-[2cqw] border-[0.4cqw] border-ink px-[4.5cqw] py-[3cqw]">
                  <p className="max-w-[38cqw] text-[2.7cqw] leading-snug">
                    No camera? Open task {t.code} in the hunt and type this code:
                  </p>
                  <p className="font-bib text-[9cqw] leading-none tracking-[0.06em] whitespace-nowrap">
                    {formatCode(t.checkpointCode as string)}
                  </p>
                </div>
                <p className="mt-[3cqw] text-[2.3cqw] text-ink-2">
                  Please leave this sign where it is, so every team can find it.
                </p>
              </div>
            </Sheet>
          ))}
        </SheetStack>
      )}
    </>
  );
}
