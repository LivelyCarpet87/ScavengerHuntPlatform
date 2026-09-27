import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { zipStream } from "./zip";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shp-zip-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

describe("zipStream", () => {
  test("round-trips files, including ones larger than a read chunk", async () => {
    const small = path.join(dir, "a.txt");
    const big = path.join(dir, "b.bin");
    fs.writeFileSync(small, "hello, hunt");
    const bytes = new Uint8Array(700_000).map((_, i) => (i * 31) % 251);
    fs.writeFileSync(big, bytes);

    const archive = await collect(
      zipStream([
        { name: "31-the-red-door/night-owls-1.txt", path: small, mtime: new Date(Date.UTC(2026, 8, 27, 18)) },
        { name: "35-tower/lake-otters-1.bin", path: big },
      ]),
    );
    const files = unzipSync(archive);
    expect(Object.keys(files).sort()).toEqual(["31-the-red-door/night-owls-1.txt", "35-tower/lake-otters-1.bin"]);
    expect(new TextDecoder().decode(files["31-the-red-door/night-owls-1.txt"])).toBe("hello, hunt");
    expect(files["35-tower/lake-otters-1.bin"]).toEqual(bytes);
  });

  test("skips files missing from disk and still produces a valid archive", async () => {
    const present = path.join(dir, "c.txt");
    fs.writeFileSync(present, "still here");
    const archive = await collect(
      zipStream([
        { name: "gone.jpg", path: path.join(dir, "nope.jpg") },
        { name: "here.txt", path: present },
      ]),
    );
    expect(Object.keys(unzipSync(archive))).toEqual(["here.txt"]);
  });

  test("an empty export is an empty, valid archive", async () => {
    expect(Object.keys(unzipSync(await collect(zipStream([]))))).toEqual([]);
  });
});
