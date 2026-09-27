const ROWS = [
  [1.33, 0.75, 1.33],
  [1.78, 1.33],
  [0.75, 1.33, 1],
];

/** Skeleton in the shape of the gallery: title, controls, justified photo rows. */
export default function GalleryLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <output className="sr-only">Loading photos</output>
      <div>
        <div className="h-9 w-32 rounded-sm bg-mist" />
        <div className="mt-2.5 h-4 w-64 max-w-full rounded-xs bg-mist" />
      </div>
      <div className="h-10 w-48 rounded-md bg-mist" />
      {[0, 1].map((section) => (
        <div key={section}>
          <div className="mb-3 flex items-center gap-3">
            <div className="size-9 rounded-full bg-mist" />
            <div className="h-6 w-44 rounded-xs bg-mist" />
          </div>
          <div className="flex flex-col gap-1.5">
            {ROWS.slice(section).map((row) => (
              <div key={row.join("-")} className="flex gap-1.5">
                {row.map((r, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                    key={i}
                    className="rounded-sm bg-mist"
                    style={{ flexGrow: r, flexBasis: 0, aspectRatio: String(r) }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
