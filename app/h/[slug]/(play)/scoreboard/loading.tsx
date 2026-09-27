/** Skeleton in the shape of the scoreboard: title, three bibs, ranked rows. */
export default function ScoreboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <output className="sr-only">Loading the scoreboard</output>
      <div>
        <div className="h-9 w-48 rounded-sm bg-mist" />
        <div className="mt-2.5 h-4 w-40 rounded-xs bg-mist" />
      </div>
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1.4fr_1.12fr_1fr] sm:gap-4">
        <div className="col-span-2 h-56 rounded-lg border-2 border-line bg-mist sm:col-span-1" />
        <div className="h-44 rounded-lg border-2 border-line bg-mist" />
        <div className="h-40 rounded-lg border-2 border-line bg-mist" />
      </div>
      <div className="divide-y divide-line">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex min-h-16 items-center gap-3 px-2 py-2.5">
            <div className="h-6 w-9 rounded-xs bg-mist" />
            <div className="size-9 rounded-full bg-mist" />
            <div className="flex-1">
              <div className="h-4 w-36 rounded-xs bg-mist" />
              <div className="mt-2 h-3 w-20 rounded-xs bg-mist" />
            </div>
            <div className="h-6 w-12 rounded-xs bg-mist" />
          </div>
        ))}
      </div>
    </div>
  );
}
