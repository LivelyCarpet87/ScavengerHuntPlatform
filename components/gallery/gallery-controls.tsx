"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Segmented } from "@/components/ui/choice";
import { Checkbox } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

/** Group photos by task or team; players can narrow to their own team. State lives in the URL. */
export function GalleryControls({
  basePath,
  by,
  mine,
  canFilterMine,
}: {
  basePath: string;
  by: "task" | "team";
  mine: boolean;
  canFilterMine: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (next: { by: "task" | "team"; mine: boolean }) => {
    const params = new URLSearchParams();
    if (next.by === "team") params.set("by", "team");
    if (next.mine) params.set("mine", "1");
    const query = params.toString();
    startTransition(() => router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <fieldset className="flex items-center gap-3">
        <legend className="float-left mr-3 text-sm font-semibold text-ink-2">Group by</legend>
        <Segmented
          name="by"
          defaultValue={by}
          options={[
            { value: "task", label: "Task" },
            { value: "team", label: "Team" },
          ]}
          onChange={(value) => go({ by: value === "team" ? "team" : "task", mine })}
        />
      </fieldset>
      {canFilterMine ? (
        <Checkbox
          label="Just my team"
          defaultChecked={mine}
          onChange={(e) => go({ by, mine: e.currentTarget.checked })}
          className="min-h-11 items-center"
        />
      ) : null}
      {pending ? <Spinner className="size-4 text-ink-2" /> : null}
    </div>
  );
}
