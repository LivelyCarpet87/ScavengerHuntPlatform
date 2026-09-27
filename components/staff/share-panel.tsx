import { MonitorPlay, Printer } from "lucide-react";
import Link from "next/link";
import { CopyButton, ShareButton } from "@/components/ui/copy-button";
import { QrCode } from "@/components/ui/qr-code";
import { cn } from "@/lib/utils";

/** "482913" → "482 913" (easier to read out loud). */
export function spacedJoinCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/**
 * How players get in: the hunt code in race-bib numerals, its QR, and quick
 * ways to pass it on (copy, share sheet, printable poster, big screen).
 */
export function SharePanel({
  huntId,
  huntName,
  slug,
  joinCode,
  joinUrl,
  host,
  isDraft,
  className,
}: {
  huntId: string;
  huntName: string;
  slug: string;
  joinCode: string;
  joinUrl: string;
  host: string;
  isDraft: boolean;
  className?: string;
}) {
  const spaced = spacedJoinCode(joinCode);
  const link =
    "flex h-11 items-center gap-3 rounded-md px-2 text-[0.9375rem] font-semibold text-ink hover:bg-mist [&_svg]:size-4 [&_svg]:text-ink-2";
  return (
    <section id="share" aria-labelledby="share-heading" className={cn("rounded-lg border border-line p-5", className)}>
      <h2 id="share-heading" className="font-cond text-xl font-bold">
        Hunt code
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Players type it at <span className="font-semibold text-ink">{host}</span>, or scan the code.
      </p>
      <p className="mt-3 font-bib text-6xl tracking-wide">
        <span aria-hidden>{spaced}</span>
        <span className="sr-only">{joinCode.split("").join(" ")}</span>
      </p>
      <div className="mt-4 flex items-start gap-4">
        <QrCode value={joinUrl} size={132} label={`QR code to join ${huntName}`} className="shrink-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <CopyButton value={joinUrl} label="Copy link" copiedLabel="Link copied" />
          <ShareButton
            url={joinUrl}
            title={huntName}
            text={`Join ${huntName} with hunt code ${spaced}.`}
            label="Share"
            variant="quiet"
            size="sm"
          />
        </div>
      </div>
      {isDraft ? (
        <p className="mt-4 rounded-md bg-sun-wash px-3 py-2 text-sm text-ink">
          The code starts working when you publish the hunt.
        </p>
      ) : null}
      <div className="mt-4 flex flex-col border-t border-line pt-3">
        <Link href={`/manage/${huntId}/print/poster`} className={link}>
          <Printer aria-hidden />
          Print the join poster
        </Link>
        <Link href={`/h/${slug}/screen`} target="_blank" className={link}>
          <MonitorPlay aria-hidden />
          Open the big screen
        </Link>
      </div>
    </section>
  );
}
