/** Skeleton in the shape of the big screen: title band, standings, photo wall, crawl. */
export default function ScreenLoading() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper lg:h-dvh" aria-busy="true">
      <output className="sr-only">Loading the big screen</output>
      <div className="flex items-end gap-6 px-6 pt-6 pb-4 lg:px-[2.6rem] lg:pt-[1.9rem]">
        <div className="size-[3.4rem] rounded-full bg-mist" />
        <div className="h-[4rem] w-[40%] rounded-md bg-mist" />
        <div className="ml-auto h-[4rem] w-[12rem] rounded-md bg-mist" />
      </div>
      <div className="grid min-h-0 flex-1 gap-8 px-6 pb-6 lg:grid-cols-[3fr_2fr] lg:gap-[2.6rem] lg:px-[2.6rem]">
        <div className="flex flex-col gap-3 rounded-xl border border-line p-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-5">
              <div className="h-[2.6rem] w-[2.6rem] rounded-sm bg-mist" />
              <div className="size-[2.9rem] rounded-full bg-mist" />
              <div className="h-[2rem] flex-1 rounded-sm bg-mist" />
              <div className="h-[2.6rem] w-[5rem] rounded-sm bg-mist" />
            </div>
          ))}
        </div>
        <div className="min-h-[20rem] rounded-xl bg-mist" />
      </div>
      <div className="h-[4.4rem] border-t border-line" />
    </div>
  );
}
