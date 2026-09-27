/*
 * Removes the metadata phones and cameras embed in photos and videos — EXIF
 * (GPS position, capture time, make and model), XMP, IPTC, comments and
 * container tags — without re-encoding: pixels, frames and sound stay
 * byte-for-byte the same.
 *
 * Accepted submissions are shared with other teams in the gallery (and with
 * everyone on hunts with a public scoreboard), while a team's location is
 * opt-in ("Add my location") and shown to judges only. storeUpload() runs
 * every photo and video through stripMetadata() before it is written.
 *
 *   JPEG        APPn segments other than JFIF, ICC and Adobe, comments, and
 *               anything after the image (appended motion-photo videos, MPF
 *               secondary images). Orientation is kept as a one-tag EXIF.
 *   PNG / GIF   text, time, EXIF and application blocks (allow-list)
 *   WebP        EXIF and XMP chunks
 *   HEIC/AVIF   Exif and XMP items are blanked in place
 *   MP4/MOV/3GP udta/meta boxes (©xyz, ISO6709 location, make, model) and
 *               XMP uuid boxes become `free`, so every offset stays valid
 *   WebM/MKV    Tags and Attachments become Void elements
 *
 * Timed metadata tracks (e.g. action-camera telemetry) are left in place.
 */

const SUPPORTED = new Set([
  "image/jpeg",
  "image/png",
  "image/apng",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/3gpp",
  "video/3gpp2",
  "video/webm",
  "video/matroska",
  "video/x-matroska",
]);

/** Whether stripMetadata knows the format (it can still fail on a malformed file). */
export function canStripMetadata(mime: string): boolean {
  return SUPPORTED.has(mime);
}

/** Returns the file without identifying metadata, or null when the format isn't supported or can't be parsed. */
export function stripMetadata(input: Buffer, mime: string): Buffer | null {
  try {
    switch (mime) {
      case "image/jpeg":
        return stripJpeg(input);
      case "image/png":
      case "image/apng":
        return stripPng(input);
      case "image/webp":
        return stripWebp(input);
      case "image/gif":
        return stripGif(input);
      case "image/heic":
      case "image/heif":
      case "image/heic-sequence":
      case "image/heif-sequence":
      case "image/avif":
        return stripIsoBmff(Buffer.from(input), "image");
      case "video/mp4":
      case "video/quicktime":
      case "video/x-m4v":
      case "video/3gpp":
      case "video/3gpp2":
        return stripIsoBmff(Buffer.from(input), "video");
      case "video/webm":
      case "video/matroska":
      case "video/x-matroska":
        return stripMatroska(Buffer.from(input));
      default:
        return null;
    }
  } catch {
    // Out-of-range reads on malformed files: treat as unsupported.
    return null;
  }
}

// ---------------------------------------------------------------------------
// EXIF orientation (the one tag worth keeping)
// ---------------------------------------------------------------------------

/** Orientation (1–8) from a TIFF-structured EXIF block, or 1. */
export function exifOrientation(tiff: Buffer): number {
  if (tiff.length >= 6 && tiff.toString("latin1", 0, 6) === "Exif\0\0") tiff = tiff.subarray(6);
  if (tiff.length < 8) return 1;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!le && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return 1;
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const ifd = le ? tiff.readUInt32LE(4) : tiff.readUInt32BE(4);
  if (ifd + 2 > tiff.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** A JPEG APP1 segment holding a big-endian EXIF block with only the Orientation tag. */
function orientationApp1(orientation: number): Buffer {
  // biome-ignore format: byte layout
  return Buffer.from([
    0xff, 0xe1, 0x00, 0x22, // APP1, 34 bytes
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

function stripJpeg(src: Buffer): Buffer | null {
  if (src.length < 4 || src[0] !== 0xff || src[1] !== 0xd8) return null;
  const parts: Buffer[] = [];
  let jfif: Buffer | null = null;
  let orientation = 1;
  let sawScan = false;
  let pos = 2;
  for (;;) {
    // A marker: 0xFF (plus optional 0xFF fill bytes) and a code.
    if (pos >= src.length || src[pos] !== 0xff) return null;
    while (pos < src.length && src[pos] === 0xff) pos++;
    if (pos >= src.length) return null;
    const marker = src[pos++];
    if (marker === 0xd9) break; // EOI: anything after it (motion photos, MPF images) is dropped
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (pos + 2 > src.length) return null;
    const length = src.readUInt16BE(pos);
    if (length < 2 || pos + length > src.length) return null;
    const segment = src.subarray(pos - 2, pos + length);
    const payload = src.subarray(pos + 2, pos + length);
    pos += length;

    if (marker >= 0xe0 && marker <= 0xef) {
      const id = payload.toString("latin1", 0, 12);
      if (marker === 0xe0 && id.startsWith("JFIF\0") && payload.length >= 12 && !jfif && !sawScan) {
        // Keep version and density; drop the (rare) embedded thumbnail.
        jfif = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), payload.subarray(0, 12), Buffer.from([0, 0])]);
      } else if (marker === 0xe1 && id.startsWith("Exif\0\0")) {
        orientation = exifOrientation(payload);
      } else if ((marker === 0xe2 && id === "ICC_PROFILE\0") || (marker === 0xee && id.startsWith("Adobe"))) {
        parts.push(segment); // color: ICC profile, Adobe color transform
      }
      continue; // every other APPn: EXIF, XMP, IPTC, MPF, maker notes…
    }
    if (marker === 0xfe) continue; // comment

    parts.push(segment);
    if (marker === 0xda) {
      // Entropy-coded scan data runs to the next marker that isn't a stuffed
      // 0xFF00 or a restart marker (progressive files have several scans).
      sawScan = true;
      const start = pos;
      while (pos < src.length) {
        if (src[pos] === 0xff) {
          const next = src[pos + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            pos += 2;
            continue;
          }
          if (pos + 1 < src.length) break;
        }
        pos++;
      }
      if (pos >= src.length) return null; // truncated: no EOI
      parts.push(src.subarray(start, pos));
    }
  }
  if (!sawScan) return null;
  const head: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (jfif) head.push(jfif);
  if (orientation !== 1) head.push(orientationApp1(orientation));
  return Buffer.concat([...head, ...parts, Buffer.from([0xff, 0xd9])]);
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Ancillary chunks that describe the image itself. Text, time, EXIF and private chunks are dropped. */
const PNG_KEEP = new Set([
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "cICP",
  "mDCV",
  "cLLI",
  "sBIT",
  "bKGD",
  "hIST",
  "pHYs",
  "sPLT",
  "acTL",
  "fcTL",
  "fdAT",
]);

function stripPng(src: Buffer): Buffer | null {
  if (src.length < 8 || !src.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const parts: Buffer[] = [src.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= src.length) {
    const length = src.readUInt32BE(pos);
    const type = src.toString("latin1", pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (end > src.length) return null;
    // Rotating needs a re-encode; let the caller do it.
    if (type === "eXIf" && exifOrientation(src.subarray(pos + 8, pos + 8 + length)) !== 1) return null;
    const critical = (src[pos + 4] & 0x20) === 0;
    if (critical || PNG_KEEP.has(type)) parts.push(src.subarray(pos, end));
    pos = end;
    if (type === "IEND") return Buffer.concat(parts);
  }
  return null;
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

const WEBP_KEEP = new Set(["VP8X", "VP8 ", "VP8L", "ALPH", "ANIM", "ANMF", "ICCP"]);

function stripWebp(src: Buffer): Buffer | null {
  if (src.length < 20 || src.toString("latin1", 0, 4) !== "RIFF" || src.toString("latin1", 8, 12) !== "WEBP") {
    return null;
  }
  const end = Math.min(src.length, 8 + src.readUInt32LE(4));
  const parts: Buffer[] = [];
  let vp8x: Buffer | null = null;
  let pos = 12;
  while (pos + 8 <= end) {
    const type = src.toString("latin1", pos, pos + 4);
    const size = src.readUInt32LE(pos + 4);
    if (pos + 8 + size > end) return null;
    const next = pos + 8 + size + (size & 1);
    if (type === "EXIF" && exifOrientation(src.subarray(pos + 8, pos + 8 + size)) !== 1) return null;
    if (WEBP_KEEP.has(type)) {
      let chunk = src.subarray(pos, Math.min(next, end));
      if (chunk.length & 1) chunk = Buffer.concat([chunk, Buffer.alloc(1)]);
      if (type === "VP8X") {
        vp8x = Buffer.from(chunk);
        chunk = vp8x;
      }
      parts.push(chunk);
    }
    pos = next;
  }
  if (parts.length === 0) return null;
  // Clear the "has EXIF" and "has XMP" flags.
  if (vp8x) vp8x[8] &= ~0x0c;
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

const GIF_APPS = new Set(["NETSCAPE2.0", "ANIMEXTS1.0", "ICCRGBG1012"]);

function stripGif(src: Buffer): Buffer | null {
  const signature = src.toString("latin1", 0, 6);
  if ((signature !== "GIF87a" && signature !== "GIF89a") || src.length < 13) return null;
  const colorTable = (packed: number) => (packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0);
  /** End of a run of data sub-blocks starting at p, or -1 when truncated. */
  const subBlocksEnd = (p: number) => {
    while (p < src.length) {
      const n = src[p];
      p += 1 + n;
      if (n === 0) return p <= src.length ? p : -1;
    }
    return -1;
  };
  let pos = 13 + colorTable(src[10]);
  if (pos > src.length) return null;
  const parts: Buffer[] = [src.subarray(0, pos)];
  while (pos < src.length) {
    const block = src[pos];
    if (block === 0x3b) break; // trailer
    if (block === 0x2c) {
      // Image: descriptor, optional local color table, LZW code size, data.
      if (pos + 11 > src.length) return null;
      const end = subBlocksEnd(pos + 10 + colorTable(src[pos + 9]) + 1);
      if (end < 0) return null;
      parts.push(src.subarray(pos, end));
      pos = end;
    } else if (block === 0x21) {
      const label = src[pos + 1];
      const end = subBlocksEnd(pos + 2);
      if (end < 0) return null;
      // Keep graphic control (timing, transparency), plain text and looping; drop comments and XMP.
      const app = label === 0xff && src[pos + 2] === 11 ? src.toString("latin1", pos + 3, pos + 14) : "";
      if (label === 0xf9 || label === 0x01 || GIF_APPS.has(app)) parts.push(src.subarray(pos, end));
      pos = end;
    } else {
      return null;
    }
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// ISO base media (MP4, MOV, 3GP, HEIC, AVIF)
// ---------------------------------------------------------------------------

type Box = { type: string; start: number; end: number; body: number; large: boolean };

/** Child boxes in [from, to). Throws on a malformed size. */
function childBoxes(buf: Buffer, from: number, to: number): Box[] {
  const out: Box[] = [];
  let pos = from;
  while (pos + 8 <= to) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    let body = pos + 8;
    let large = false;
    if (size === 1) {
      if (pos + 16 > to) throw new Error("truncated box");
      size = Number(buf.readBigUInt64BE(pos + 8));
      body = pos + 16;
      large = true;
    } else if (size === 0) {
      size = to - pos; // runs to the end of the enclosing box
    }
    if (type === "uuid") body += 16;
    if (size < body - pos || pos + size > to) throw new Error("bad box size");
    out.push({ type, start: pos, end: pos + size, body, large });
    pos += size;
  }
  return out;
}

/** Turns a box into a `free` box of the same size, so no offset in the file moves. */
function blankBox(buf: Buffer, box: Box) {
  buf.write("free", box.start + 4, "latin1");
  buf.fill(0, box.start + (box.large ? 16 : 8), box.end);
}

/** XMP packets in uuid boxes (BE7ACFCB-97A9-42E8-9C71-999491E3AFAC). */
function isXmpUuid(buf: Buffer, box: Box) {
  return box.type === "uuid" && buf.toString("hex", box.body - 16, box.body) === "be7acfcb97a942e89c71999491e3afac";
}

function stripIsoBmff(buf: Buffer, kind: "image" | "video"): Buffer | null {
  const top = childBoxes(buf, 0, buf.length);
  if (!top.some((b) => ["ftyp", "moov", "mdat", "meta", "wide", "free", "skip"].includes(b.type))) return null;
  for (const box of top) {
    if (box.type === "moov") stripMovie(buf, box);
    else if (box.type === "meta" && kind === "image") {
      if (!blankHeifMetadataItems(buf, box)) return null;
    } else if (box.type === "meta" || box.type === "udta" || isXmpUuid(buf, box)) blankBox(buf, box);
  }
  return buf;
}

/** moov and its tracks: user data (©xyz location, make, model), metadata (ISO6709 location) and XMP. */
function stripMovie(buf: Buffer, container: Box) {
  for (const box of childBoxes(buf, container.body, container.end)) {
    if (box.type === "udta" || box.type === "meta" || isXmpUuid(buf, box)) blankBox(buf, box);
    else if (box.type === "trak") stripMovie(buf, box);
  }
}

/** The fixed-size unsigned integer (0, 2, 4 or 8 bytes) at pos. */
function readSized(buf: Buffer, pos: number, bytes: number): number {
  if (bytes === 0) return 0;
  if (bytes === 2) return buf.readUInt16BE(pos);
  if (bytes === 4) return buf.readUInt32BE(pos);
  if (bytes === 8) return Number(buf.readBigUInt64BE(pos));
  throw new Error("bad field size");
}

/** End of the NUL-terminated string at pos. */
function cstringEnd(buf: Buffer, pos: number, limit: number): number {
  const nul = buf.indexOf(0, pos);
  if (nul < 0 || nul >= limit) throw new Error("unterminated string");
  return nul + 1;
}

/**
 * HEIF keeps EXIF and XMP as items inside the top-level meta box: finds them
 * in iinf, locates their bytes through iloc and blanks them in place. Returns
 * false when an item's location can't be resolved.
 */
function blankHeifMetadataItems(buf: Buffer, meta: Box): boolean {
  const children = childBoxes(buf, meta.body + 4, meta.end); // meta is a full box
  const iinf = children.find((b) => b.type === "iinf");
  const iloc = children.find((b) => b.type === "iloc");
  const idat = children.find((b) => b.type === "idat");
  if (!iinf) return true;

  // iinf: which items are EXIF or XMP.
  const targets = new Map<number, "exif" | "xmp">();
  const iinfVersion = buf[iinf.body];
  const entries = iinf.body + 4 + (iinfVersion === 0 ? 2 : 4);
  for (const infe of childBoxes(buf, entries, iinf.end)) {
    if (infe.type !== "infe") continue;
    const version = buf[infe.body];
    let p = infe.body + 4;
    if (version >= 2) {
      const id = version === 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
      p += (version === 2 ? 2 : 4) + 2;
      const itemType = buf.toString("latin1", p, p + 4);
      p += 4;
      if (itemType === "Exif") targets.set(id, "exif");
      else if (itemType === "mime") {
        p = cstringEnd(buf, p, infe.end); // item name
        const contentType = buf.toString("latin1", p, cstringEnd(buf, p, infe.end) - 1);
        if (contentType.startsWith("application/rdf+xml")) targets.set(id, "xmp");
      }
    } else {
      const id = buf.readUInt16BE(p);
      p = cstringEnd(buf, p + 4, infe.end); // item name
      const contentType = buf.toString("latin1", p, cstringEnd(buf, p, infe.end) - 1);
      if (contentType.startsWith("application/rdf+xml")) targets.set(id, "xmp");
    }
  }
  if (targets.size === 0) return true;
  if (!iloc) return false;

  // iloc: where those items' bytes are.
  const version = buf[iloc.body];
  let p = iloc.body + 4;
  const offsetSize = buf[p] >> 4;
  const lengthSize = buf[p] & 0x0f;
  const baseOffsetSize = buf[p + 1] >> 4;
  const indexSize = version === 1 || version === 2 ? buf[p + 1] & 0x0f : 0;
  p += 2;
  const itemCount = version < 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
  p += version < 2 ? 2 : 4;
  const ranges: { start: number; end: number; kind: "exif" | "xmp" }[] = [];
  for (let i = 0; i < itemCount; i++) {
    const id = version < 2 ? buf.readUInt16BE(p) : buf.readUInt32BE(p);
    p += version < 2 ? 2 : 4;
    let method = 0;
    if (version === 1 || version === 2) {
      method = buf.readUInt16BE(p) & 0x0f;
      p += 2;
    }
    p += 2; // data reference index
    const baseOffset = readSized(buf, p, baseOffsetSize);
    p += baseOffsetSize;
    const extentCount = buf.readUInt16BE(p);
    p += 2;
    const kind = targets.get(id);
    for (let e = 0; e < extentCount; e++) {
      p += indexSize;
      const offset = readSized(buf, p, offsetSize);
      p += offsetSize;
      const length = readSized(buf, p, lengthSize);
      p += lengthSize;
      if (!kind) continue;
      // Bytes in another item, or an open-ended extent: don't guess.
      if (method === 2 || length === 0) return false;
      const origin = method === 1 ? (idat?.body ?? -1) : 0;
      if (origin < 0) return false;
      const start = origin + baseOffset + offset;
      const end = start + length;
      if (end > (method === 1 && idat ? idat.end : buf.length)) return false;
      ranges.push({ start, end, kind });
    }
    if (p > iloc.end) return false;
  }
  for (const r of ranges) {
    buf.fill(0, r.start, r.end);
    // A valid but empty EXIF block: 4-byte TIFF header offset (0), then an empty IFD0.
    if (r.kind === "exif" && r.end - r.start >= 18) {
      Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]).copy(buf, r.start + 4);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Matroska / WebM
// ---------------------------------------------------------------------------

const EBML_HEADER = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;
const TAGS = 0x1254c367;
const ATTACHMENTS = 0x1941a469;
const SEGMENT_CHILDREN = new Set([
  0x114d9b74, // SeekHead
  0x1549a966, // Info
  0x1654ae6b, // Tracks
  0x1043a770, // Chapters
  CLUSTER,
  0x1c53bb6b, // Cues
  ATTACHMENTS,
  TAGS,
  0xec, // Void
  0xbf, // CRC-32
]);

type Element = { id: number; start: number; data: number; size: number | null };

/** Element header at pos: id (1–4 bytes, marker kept) and size (1–8 bytes; null when unknown). */
function readElement(buf: Buffer, pos: number): Element | null {
  const first = buf[pos];
  if (first === undefined || first === 0) return null;
  const idLength = Math.clz32(first) - 23;
  if (idLength > 4 || pos + idLength > buf.length) return null;
  let id = 0;
  for (let i = 0; i < idLength; i++) id = id * 256 + buf[pos + i];
  const sizePos = pos + idLength;
  const lead = buf[sizePos];
  if (lead === undefined || lead === 0) return null;
  const sizeLength = Math.clz32(lead) - 23;
  if (sizePos + sizeLength > buf.length) return null;
  let size = lead & (0xff >> sizeLength);
  let unknown = size === 0xff >> sizeLength;
  for (let i = 1; i < sizeLength; i++) {
    const byte = buf[sizePos + i];
    size = size * 256 + byte;
    unknown &&= byte === 0xff;
  }
  return { id, start: pos, data: sizePos + sizeLength, size: unknown ? null : size };
}

/** Overwrites [start, end) with a Void element of the same length. */
function voidElement(buf: Buffer, start: number, end: number) {
  const total = end - start;
  const sizeLength = Math.min(8, total - 1);
  let value = total - 1 - sizeLength;
  buf.fill(0, start, end);
  buf[start] = 0xec;
  for (let i = sizeLength; i >= 1; i--) {
    buf[start + i] = value % 256;
    value = Math.floor(value / 256);
  }
  buf[start + 1] |= 0x80 >> (sizeLength - 1);
}

function stripMatroska(buf: Buffer): Buffer | null {
  const header = readElement(buf, 0);
  if (!header || header.id !== EBML_HEADER || header.size === null) return null;
  const segment = readElement(buf, header.data + header.size);
  if (!segment || segment.id !== SEGMENT) return null;
  const segmentEnd = segment.size === null ? buf.length : Math.min(buf.length, segment.data + segment.size);
  let pos = segment.data;
  while (pos < segmentEnd) {
    const el = readElement(buf, pos);
    if (!el) return null;
    if (el.size === null) {
      // Live recordings (MediaRecorder) write clusters of unknown size: they end
      // where the next top-level element begins.
      if (el.id !== CLUSTER) return null;
      let p = el.data;
      while (p < segmentEnd) {
        const child = readElement(buf, p);
        if (!child) return null;
        if (SEGMENT_CHILDREN.has(child.id)) break;
        if (child.size === null) return null;
        p = child.data + child.size;
      }
      pos = p;
      continue;
    }
    const end = el.data + el.size;
    if (end > segmentEnd) {
      // A recording cut short: the last cluster is truncated, nothing follows it.
      if (el.id === CLUSTER) break;
      return null;
    }
    if (el.id === TAGS || el.id === ATTACHMENTS) voidElement(buf, el.start, end);
    pos = end;
  }
  return buf;
}
