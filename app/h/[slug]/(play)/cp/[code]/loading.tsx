/** A checkpoint poster was scanned: an empty control circle waits for its punch. */
export default function CheckpointLoading() {
  return (
    <div
      className="flex min-h-[calc(100dvh-13rem)] flex-col items-center justify-center gap-5 py-8 text-center"
      aria-busy="true"
    >
      <output className="sr-only">Checking the checkpoint</output>
      <div className="size-28 animate-pulse rounded-full border-[5px] border-dashed border-accent/50" />
      <div className="h-8 w-48 animate-pulse rounded-md bg-mist" />
      <div className="h-5 w-32 animate-pulse rounded-md bg-mist" />
    </div>
  );
}
