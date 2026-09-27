import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { HuntMap } from "@/components/staff/hunt-map";
import { PrintToolbar } from "@/components/staff/print/print-kit";
import { Sheet, SheetStack } from "@/components/staff/print/sheet";
import { spacedJoinCode } from "@/components/staff/share-panel";
import { LogoMark, StartMark } from "@/components/ui/control";
import { Mascot } from "@/components/ui/mascot";
import { QrCode } from "@/components/ui/qr-code";
import { requireStaff } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { absoluteUrl, baseUrl, links } from "@/lib/url";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Join poster" };

export default async function PosterPage({ params }: { params: Promise<{ huntId: string }> }) {
  const { huntId } = await params;
  const { hunt } = await requireStaff(huntId, "judge");
  const [joinUrl, base, taskRow] = await Promise.all([
    absoluteUrl(links.join(hunt.joinCode)),
    baseUrl(),
    db.select({ n: count() }).from(tasks).where(eq(tasks.huntId, hunt.id)).get(),
  ]);
  const host = new URL(base).host;
  const longName = hunt.name.length > 26;

  return (
    <>
      <PrintToolbar
        huntId={hunt.id}
        what="poster"
        title="Join poster"
        summary="The hunt code and a QR code that opens the hunt. Put it up at the start and wherever players gather."
        backHref={`/manage/${hunt.id}`}
        backLabel="Overview"
        tip="Print on A4 at 100% scale (“Actual size”), in color if you can: the map and its controls use the hunt’s color."
      />
      <SheetStack>
        <Sheet label="Join poster">
          <div data-accent={hunt.accent} className="flex h-full flex-col">
            <HuntMap
              seed={hunt.id}
              controls={taskRow?.n ?? 0}
              aspect={4.2}
              ringSize={11}
              className="h-[24cqw] shrink-0 border-b-[0.3cqw] border-ink"
            />
            <div className="flex flex-1 flex-col px-[8cqw] pt-[6cqw] pb-[6cqw]">
              <h2
                className={cn(
                  "font-cond font-extrabold tracking-tight text-balance",
                  longName ? "text-[7.5cqw] leading-[0.98]" : "text-[10.5cqw] leading-[0.92]",
                )}
              >
                {hunt.name}
              </h2>
              {hunt.tagline ? <p className="mt-[2.4cqw] text-[3cqw] leading-snug text-ink-2">{hunt.tagline}</p> : null}

              <p className="mt-[7cqw] font-cond text-[6.4cqw] leading-none font-extrabold">Join the hunt</p>
              <div className="mt-[4cqw] flex items-center gap-[5cqw]">
                <QrCode
                  value={joinUrl}
                  size={480}
                  label={`QR code to join ${hunt.name}`}
                  className="size-[40cqw] shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[3.4cqw] leading-tight font-semibold">Scan with your phone camera</p>
                  <p className="mt-[4cqw] text-[2.7cqw] leading-snug text-ink-2">
                    or open <span className="font-semibold text-ink">{host}</span> and enter the hunt code
                  </p>
                  <p className="mt-[1cqw] font-bib text-[12.5cqw] leading-none tracking-wide">
                    {spacedJoinCode(hunt.joinCode)}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex items-end justify-between gap-[4cqw]">
                <div className="flex flex-col gap-[2.5cqw]">
                  {hunt.startsAt ? (
                    <p className="flex items-center gap-[2cqw] text-[3.4cqw] font-semibold">
                      <StartMark size={32} className="size-[4.6cqw]" />
                      Starts {formatDateTime(hunt.startsAt, hunt.timezone)}
                    </p>
                  ) : null}
                  <p className="flex items-center gap-[1.5cqw] text-[2.4cqw] text-ink-2">
                    <LogoMark size={20} className="size-[3.4cqw]" />
                    {env.appName}
                  </p>
                </div>
                <Mascot size={256} className="h-auto w-[25cqw]" />
              </div>
            </div>
          </div>
        </Sheet>
      </SheetStack>
    </>
  );
}
