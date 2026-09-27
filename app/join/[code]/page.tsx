import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CodeHero } from "@/components/join/code-hero";
import { SiteHeader } from "@/components/shells/site-header";
import { extractHuntCode, sanitizeCodeTyping } from "@/lib/player/join";
import { codeGuard, findHuntForCode } from "@/lib/player/queries";

export const metadata: Metadata = { title: "Join a hunt" };

/**
 * /join/482913 — where hunt posters and QR codes point. A known code goes
 * straight to the hunt (carrying the code, so registration doesn't ask for
 * it again); anything else gets the usual code entry, with the problem said
 * once, right under the digits.
 */
export default async function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const decoded = safeDecode(raw);
  const code = extractHuntCode(decoded);

  let error = "No hunt uses that code. Check the six digits on the poster.";
  if (code) {
    // Only wrong codes count, so a crowd scanning the same poster never trips the limit.
    const guard = await codeGuard("hunt");
    if (guard.retryAfterSec) {
      error = "Too many wrong codes were tried from this network. Wait a minute, then try again.";
    } else {
      const hunt = await findHuntForCode(code);
      if (hunt) redirect(`/h/${hunt.slug}?code=${code}`);
      guard.miss();
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="pb-16">
        <CodeHero
          defaultCode={code ?? sanitizeCodeTyping(decoded)}
          error={error}
          autoFocus
          footer={
            <>
              Lost?{" "}
              <Link href="/" className="font-semibold text-ink underline underline-offset-2">
                Go to the start page
              </Link>
            </>
          }
        />
      </main>
    </>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
