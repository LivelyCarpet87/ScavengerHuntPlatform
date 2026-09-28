/** Skeleton for the admin lists while their queries run. The header and tabs stay in place (layout). */
export default function AdminLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="h-5 w-56 rounded-sm bg-mist" />
      <ul className="mt-6 divide-y divide-line">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-3 py-4">
            <span className="size-10 shrink-0 rounded-full bg-mist" />
            <div className="flex-1">
              <div className="h-4 w-40 rounded-sm bg-mist" />
              <div className="mt-2 h-3.5 w-56 max-w-full rounded-sm bg-mist" />
            </div>
            <span className="h-11 w-24 rounded-md bg-mist" />
          </li>
        ))}
      </ul>
    </div>
  );
}
