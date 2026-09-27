import { type FileHandle, open } from "node:fs/promises";
import { Zip, ZipPassThrough } from "fflate";

export type ZipSource = {
  /** Path inside the archive, e.g. "31-the-red-door/night-owls-1.jpg". */
  name: string;
  /** File on disk. Missing files are skipped. */
  path: string;
  mtime?: Date;
};

const CHUNK = 256 * 1024;

/**
 * Streams a ZIP of files from disk. Pull-based: the next chunk is read only
 * when the client is ready for more, so a multi-gigabyte export of videos
 * uses a few hundred kilobytes of memory. Entries are stored uncompressed
 * (photos and videos are already compressed), which also keeps CPU low.
 */
export function zipStream(sources: ZipSource[]): ReadableStream<Uint8Array> {
  let zip: Zip;
  let index = 0;
  let current: { entry: ZipPassThrough; handle: FileHandle } | null = null;
  let done = false;

  const closeCurrent = async () => {
    const closing = current;
    current = null;
    await closing?.handle.close().catch(() => {});
  };

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        zip = new Zip((err, chunk, final) => {
          if (err) {
            done = true;
            controller.error(err);
            return;
          }
          if (chunk?.length) controller.enqueue(chunk);
          if (final) {
            done = true;
            controller.close();
          }
        });
      },
      async pull() {
        // Push until at least one chunk went out (or the archive is finished).
        while (!done) {
          if (!current) {
            if (index >= sources.length) {
              zip.end();
              return;
            }
            const source = sources[index++];
            let handle: FileHandle;
            try {
              handle = await open(source.path, "r");
            } catch {
              continue; // The file is gone from disk; leave it out rather than fail the export.
            }
            const entry = new ZipPassThrough(source.name);
            if (source.mtime) entry.mtime = source.mtime;
            zip.add(entry);
            current = { entry, handle };
          }
          const buffer = new Uint8Array(CHUNK);
          const { bytesRead } = await current.handle.read(buffer, 0, CHUNK, null);
          if (bytesRead === 0) {
            current.entry.push(new Uint8Array(0), true);
            await closeCurrent();
            return;
          }
          current.entry.push(buffer.subarray(0, bytesRead), false);
          return;
        }
      },
      async cancel() {
        done = true;
        await closeCurrent();
        zip?.terminate();
      },
    },
    { highWaterMark: 4 },
  );
}
