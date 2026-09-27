import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { exifOrientation, stripMetadata } from "./strip-metadata";

/*
 * Every fixture carries recognisable strings in the places phones put
 * location and device details; after stripping none of them may remain,
 * and the picture or movie data must be untouched.
 */

const SECRETS = ["LeakyPhoneMaker", "LeakyModel", "LeakyXmpTitle", "+51.7596-001.2620", "Oxford"];
const leaks = (buf: Buffer) => SECRETS.filter((s) => buf.includes(s));

const EXIF = {
  IFD0: { Make: "LeakyPhoneMaker", Model: "LeakyModel 9" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "51/1 45/1 3456/100",
    GPSLongitudeRef: "W",
    GPSLongitude: "1/1 15/1 4320/100",
  },
};
const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:title="LeakyXmpTitle"/></rdf:RDF></x:xmpmeta>';

const canvas = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: "#c33" } }).composite([
    {
      input: Buffer.from('<svg width="20" height="10"><rect width="20" height="10" fill="#fff"/></svg>'),
      top: 4,
      left: 6,
    },
  ]);
const pixels = (buf: Buffer) => sharp(buf).raw().toBuffer();

describe("JPEG", () => {
  test("drops EXIF, GPS and XMP, keeps orientation and the image data", async () => {
    const input = await canvas().jpeg().withExif(EXIF).withXmp(XMP).withMetadata({ orientation: 6 }).toBuffer();
    expect(leaks(input).length).toBeGreaterThan(0);
    const out = stripMetadata(input, "image/jpeg");
    expect(out).not.toBeNull();
    if (!out) return;
    expect(leaks(out)).toEqual([]);
    const meta = await sharp(out).metadata();
    expect(meta.orientation).toBe(6);
    expect(meta.exif?.length).toBe(32); // "Exif\0\0" + one-tag IFD
    expect(meta.xmp).toBeUndefined();
    expect(await pixels(out)).toEqual(await pixels(input));
  });

  test("drops comments and anything appended after the image (motion photos)", async () => {
    const plain = await canvas().jpeg({ progressive: true }).toBuffer();
    const comment = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0x12]), Buffer.from("LeakyPhoneMaker!")]);
    const input = Buffer.concat([plain.subarray(0, 2), comment, plain.subarray(2), Buffer.from("....ftypmp42 Oxford")]);
    const out = stripMetadata(input, "image/jpeg");
    expect(out).not.toBeNull();
    if (!out) return;
    expect(leaks(out)).toEqual([]);
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect((await sharp(out).metadata()).orientation).toBeUndefined();
    expect(await pixels(out)).toEqual(await pixels(plain));
  });

  test("refuses a truncated file instead of guessing", async () => {
    const plain = await canvas().jpeg().toBuffer();
    expect(stripMetadata(plain.subarray(0, plain.length - 40), "image/jpeg")).toBeNull();
  });
});

describe("PNG and WebP", () => {
  test("PNG loses eXIf and text chunks", async () => {
    const input = await canvas().png().withExif(EXIF).withXmp(XMP).toBuffer();
    const out = stripMetadata(input, "image/png");
    expect(out).not.toBeNull();
    if (!out) return;
    expect(leaks(out)).toEqual([]);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(await pixels(out)).toEqual(await pixels(input));
  });

  test("WebP loses its EXIF and XMP chunks and flags", async () => {
    const input = await canvas().webp({ lossless: true }).withExif(EXIF).withXmp(XMP).toBuffer();
    const out = stripMetadata(input, "image/webp");
    expect(out).not.toBeNull();
    if (!out) return;
    expect(leaks(out)).toEqual([]);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(await pixels(out)).toEqual(await pixels(input));
  });

  test("a rotated PNG or WebP is left to the caller (it needs a re-encode)", async () => {
    const png = await canvas().png().withMetadata({ orientation: 6 }).toBuffer();
    const webp = await canvas().webp().withMetadata({ orientation: 6 }).toBuffer();
    expect(stripMetadata(png, "image/png")).toBeNull();
    expect(stripMetadata(webp, "image/webp")).toBeNull();
  });
});

describe("GIF", () => {
  test("drops comment and XMP blocks, keeps frames and looping", async () => {
    const plain = await canvas().gif().toBuffer();
    const subBlocks = (text: string) =>
      Buffer.concat([Buffer.from([text.length]), Buffer.from(text), Buffer.from([0])]);
    const comment = Buffer.concat([Buffer.from([0x21, 0xfe]), subBlocks("LeakyPhoneMaker")]);
    const xmp = Buffer.concat([Buffer.from([0x21, 0xff, 11]), Buffer.from("XMP DataXMP"), subBlocks("LeakyXmpTitle")]);
    const input = Buffer.concat([plain.subarray(0, -1), comment, xmp, Buffer.from([0x3b])]);
    const out = stripMetadata(input, "image/gif");
    expect(out).not.toBeNull();
    if (!out) return;
    expect(leaks(out)).toEqual([]);
    expect(out).toEqual(plain);
  });
});

describe("HEIF/AVIF", () => {
  test("blanks the Exif and XMP items in place", async () => {
    const input = await canvas().avif({ effort: 0 }).withExif(EXIF).withXmp(XMP).toBuffer();
    expect(leaks(input).length).toBeGreaterThan(0);
    const out = stripMetadata(input, "image/avif");
    expect(out).not.toBeNull();
    if (!out) return;
    expect(leaks(out)).toEqual([]);
    expect(out.length).toBe(input.length);
    expect(exifOrientation((await sharp(out).metadata()).exif ?? Buffer.alloc(0))).toBe(1);
    expect(await pixels(out)).toEqual(await pixels(input));
  });
});

// ---------------------------------------------------------------------------
// Video containers, built by hand
// ---------------------------------------------------------------------------

function box(type: string, ...children: Buffer[]): Buffer {
  const body = Buffer.concat(children);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
}

describe("MP4/MOV", () => {
  test("user data, metadata and XMP boxes become free space of the same size", () => {
    const mdat = box("mdat", Buffer.from("frames and sound, untouched"));
    const input = Buffer.concat([
      box("ftyp", Buffer.from("qt  \0\0\0\0qt  ")),
      box(
        "moov",
        box("mvhd", Buffer.alloc(100)),
        box("udta", box("\xa9xyz", Buffer.from("\0\x12\x15\xc7+51.7596-001.2620/"))),
        box("meta", box("keys", Buffer.from("com.apple.quicktime.make LeakyPhoneMaker"))),
        box("trak", box("tkhd", Buffer.alloc(84)), box("udta", box("name", Buffer.from("LeakyModel")))),
      ),
      box("uuid", Buffer.from("be7acfcb97a942e89c71999491e3afac", "hex"), Buffer.from(XMP)),
      mdat,
    ]);
    const out = stripMetadata(input, "video/quicktime");
    expect(out).not.toBeNull();
    if (!out) return;
    expect(leaks(out)).toEqual([]);
    expect(out.length).toBe(input.length);
    expect(out.subarray(-mdat.length)).toEqual(mdat);
    expect(input.includes("LeakyPhoneMaker")).toBe(true); // the caller's buffer is left alone
    const moov = out.indexOf("moov") - 4;
    expect(out.toString("latin1", moov + 8 + 108 + 4, moov + 8 + 108 + 8)).toBe("free");
  });

  test("refuses a file whose boxes don't add up", () => {
    const bad = Buffer.concat([box("ftyp", Buffer.from("isom")), Buffer.from([0, 0, 0x10, 0, 0x6d, 0x6f, 0x6f, 0x76])]);
    expect(stripMetadata(bad, "video/mp4")).toBeNull();
  });
});

describe("WebM/Matroska", () => {
  const el = (id: number[], body: Buffer) => {
    // 8-byte size vint keeps the fixture simple.
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(body.length) | (1n << 56n));
    return Buffer.concat([Buffer.from(id), size, body]);
  };
  const UNKNOWN = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

  test("Tags become Void, also after a cluster of unknown size", () => {
    const tags = (text: string) =>
      el([0x12, 0x54, 0xc3, 0x67], el([0x73, 0x73], el([0x67, 0xc8], el([0x44, 0x87], Buffer.from(text)))));
    const block = el([0xa3], Buffer.from("frame data"));
    const input = Buffer.concat([
      el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], Buffer.from("webm"))),
      Buffer.from([0x18, 0x53, 0x80, 0x67]),
      UNKNOWN,
      el([0x15, 0x49, 0xa9, 0x66], el([0x7b, 0xa9], Buffer.from("title"))),
      tags("Oxford"),
      Buffer.from([0x1f, 0x43, 0xb6, 0x75]),
      UNKNOWN,
      el([0xe7], Buffer.from([0])),
      block,
      tags("LeakyPhoneMaker"),
    ]);
    const out = stripMetadata(input, "video/webm");
    expect(out).not.toBeNull();
    if (!out) return;
    expect(leaks(out)).toEqual([]);
    expect(out.length).toBe(input.length);
    expect(out.includes(block)).toBe(true);
    expect(out.includes("title")).toBe(true);
  });
});

test("formats without a stripper are reported, not passed through", () => {
  expect(stripMetadata(Buffer.from("RIFF\0\0\0\0AVI LIST"), "video/vnd.avi")).toBeNull();
  expect(stripMetadata(Buffer.from("not a jpeg"), "image/jpeg")).toBeNull();
});
