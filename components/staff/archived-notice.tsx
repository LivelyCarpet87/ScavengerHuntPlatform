import { Archive } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui/misc";

/**
 * Explains why editing is switched off on an archived hunt's organizer pages,
 * with the way back: restoring it in Settings.
 */
export function ArchivedNotice({
  huntId,
  children = "Its tasks, teams, schedule and scores are read-only, so the results stay as they are.",
  className,
}: {
  huntId: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Notice tone="info" icon={<Archive className="size-4" />} title="This hunt is archived" className={className}>
      {children}{" "}
      <Link href={`/manage/${huntId}/settings#status`} className="font-semibold text-ink underline">
        Restore it in Settings
      </Link>{" "}
      to make changes.
    </Notice>
  );
}
