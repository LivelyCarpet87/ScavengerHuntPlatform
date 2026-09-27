import { ButtonLink } from "@/components/ui/button";

/** Previous/next page of photos; keeps the grouping and the "Just my team" filter. */
export function GalleryPager({
  basePath,
  by = "task",
  mine = false,
  page,
  pages,
}: {
  basePath: string;
  by?: "task" | "team";
  mine?: boolean;
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;
  const href = (n: number) => {
    const params = new URLSearchParams();
    if (by === "team") params.set("by", "team");
    if (mine) params.set("mine", "1");
    if (n > 1) params.set("page", String(n));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  return (
    <nav
      aria-label="Photo pages"
      className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-ink-2">
        Page <span className="font-semibold text-ink">{page}</span> of {pages}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        {page > 1 ? (
          <ButtonLink href={href(page - 1)} variant="secondary">
            Previous page
          </ButtonLink>
        ) : null}
        {page < pages ? (
          <ButtonLink href={href(page + 1)} variant="secondary" className="col-start-2">
            Next page
          </ButtonLink>
        ) : null}
      </div>
    </nav>
  );
}
