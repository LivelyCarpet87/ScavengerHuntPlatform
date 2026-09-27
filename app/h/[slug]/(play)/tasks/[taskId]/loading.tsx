/** Skeleton in the shape of the task page: back link, control and title, points, description, form. */
export default function TaskLoading() {
  const block = "rounded-md bg-mist animate-pulse";
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <output className="sr-only">Loading the task</output>
      <div className="flex flex-col gap-5">
        <div className={`${block} h-5 w-24`} />
        <div className="flex items-start gap-4">
          <div className="size-[72px] shrink-0 animate-pulse rounded-full border-4 border-mist-2" />
          <div className="flex flex-1 flex-col gap-2.5 pt-2">
            <div className={`${block} h-9 w-3/4`} />
            <div className={`${block} h-6 w-1/2`} />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-y border-line py-4">
          <div className={`${block} h-11 w-40`} />
        </div>
        <div className="flex flex-col gap-2">
          <div className={`${block} h-4 w-full`} />
          <div className={`${block} h-4 w-11/12`} />
          <div className={`${block} h-4 w-2/3`} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className={`${block} h-7 w-36`} />
        <div className={`${block} h-36 w-full rounded-lg`} />
        <div className={`${block} h-14 w-full`} />
      </div>
    </div>
  );
}
