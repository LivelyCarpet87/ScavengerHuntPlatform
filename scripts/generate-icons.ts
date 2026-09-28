/**
 * Generates the installable-app icons in public/icons from the mascot artwork.
 *
 *   bun run icons        (bun scripts/generate-icons.ts)
 *
 * Outputs (all PNG):
 *   icon-192.png, icon-512.png           "any" purpose: the hedgehog on transparency,
 *                                        centred with ANY_PADDING on every side so
 *                                        launchers and taskbars don't crop or crowd it
 *   maskable-192.png, maskable-512.png   Android adaptive icon: the hedgehog, with a
 *                                        white sticker outline, centred on its bounding
 *                                        box inside the 80% safe zone on open-land
 *                                        yellow (#FFC21A); the 192 one is also the
 *                                        install card's picture
 *   badge-96.png                         Android notification badge: the logo mark (a
 *                                        control circle with the start triangle) in
 *                                        white on transparency — Android only uses its alpha
 *
 * app/icon.png, app/apple-icon.png (the iOS home screen icon) and app/favicon.ico
 * are separate and untouched.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dir, "..");
const SOURCE = path.join(ROOT, "public/brand/hedgehog-512.png");
const OUT = path.join(ROOT, "public/icons");
const OPEN_LAND_YELLOW = "#FFC21A";
/** Space around the "any" icons on every side, as a share of the icon's size. */
const ANY_PADDING = 0.09;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

type Geometry = {
  /** Bounding box of the visible pixels in the source. */
  minX: number;
  minY: number;
  width: number;
  height: number;
  /** Centre and radius of the smallest circle around every visible pixel (source pixels). */
  cx: number;
  cy: number;
  radius: number;
  /** Radius of the circle around the bounding box's centre that holds every visible pixel. */
  boxRadius: number;
};

/**
 * Where the artwork's visible pixels are: the bounding box, and the smallest
 * enclosing circle (found by a coarse-to-fine search around the box centre),
 * which decides how large the art can be inside a circular safe zone.
 */
async function measure(file: string): Promise<Geometry> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const visible = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * channels + 3] > 8;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  // Only edge pixels can be the farthest from any centre inside the shape.
  const edge: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!visible(x, y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (!visible(x - 1, y) || !visible(x + 1, y) || !visible(x, y - 1) || !visible(x, y + 1)) edge.push([x, y]);
    }
  }
  if (maxX < 0) throw new Error(`${file} is fully transparent`);

  const farthest = (cx: number, cy: number) => {
    let r2 = 0;
    for (const [x, y] of edge) {
      // The pixel's farthest corner, not its centre.
      const dx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx));
      const dy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy));
      r2 = Math.max(r2, dx * dx + dy * dy);
    }
    return Math.sqrt(r2);
  };
  let cx = (minX + maxX + 1) / 2;
  let cy = (minY + maxY + 1) / 2;
  let radius = farthest(cx, cy);
  for (let step = 32; step >= 0.5; step /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dx, dy] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ]) {
        const r = farthest(cx + dx, cy + dy);
        if (r < radius) {
          radius = r;
          cx += dx;
          cy += dy;
          improved = true;
        }
      }
    }
  }
  const boxRadius = farthest((minX + maxX + 1) / 2, (minY + maxY + 1) / 2);
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1, cx, cy, radius, boxRadius };
}

/** The mascot cropped to its visible pixels and scaled by `scale`, as a PNG buffer. */
async function scaledMascot(g: Geometry, scale: number): Promise<{ png: Buffer; width: number; height: number }> {
  const width = Math.round(g.width * scale);
  const height = Math.round(g.height * scale);
  const png = await sharp(SOURCE)
    .extract({ left: g.minX, top: g.minY, width: g.width, height: g.height })
    .resize(width, height, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  return { png, width, height };
}

/** Places the scaled mascot on a square canvas with the point (cx, cy) of the source at the canvas centre. */
async function placed(g: Geometry, scale: number, size: number, cx: number, cy: number): Promise<Buffer> {
  const m = await scaledMascot(g, scale);
  return sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } })
    .composite([
      {
        input: m.png,
        left: Math.round(size / 2 - (cx - g.minX) * scale),
        top: Math.round(size / 2 - (cy - g.minY) * scale),
      },
    ])
    .png()
    .toBuffer();
}

/**
 * A white "sticker" backing that follows the artwork's silhouette, `outline`
 * pixels wider on every side. Keeps the yellow parts of the hedgehog readable
 * on the yellow maskable background. Made by stamping an anti-aliased disc
 * around every edge pixel of the alpha channel (an exact round dilation).
 */
async function sticker(layer: Buffer, size: number, outline: number): Promise<Buffer> {
  const alpha = await sharp(layer).extractChannel("alpha").raw().toBuffer();
  const mask = new Uint8Array(size * size);
  const reach = Math.ceil(outline + 1);
  const disc: [number, number, number][] = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const coverage = Math.min(1, Math.max(0, outline + 0.5 - Math.hypot(dx, dy)));
      if (coverage > 0) disc.push([dx, dy, Math.round(coverage * 255)]);
    }
  }
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && alpha[y * size + x] >= 128;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      mask[i] = Math.max(mask[i], alpha[i]);
      if (!solid(x, y)) continue;
      if (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) continue;
      for (const [dx, dy, v] of disc) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
        const j = ty * size + tx;
        if (v > mask[j]) mask[j] = v;
      }
    }
  }
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .joinChannel(Buffer.from(mask), { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

async function write(name: string, image: ReturnType<typeof sharp>) {
  const file = path.join(OUT, name);
  await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(file);
  const meta = await sharp(file).metadata();
  const { size } = await fs.stat(file);
  console.log(`  ${name.padEnd(26)} ${meta.width}×${meta.height}  ${(size / 1024).toFixed(1)} KB`);
}

const g = await measure(SOURCE);
await fs.mkdir(OUT, { recursive: true });
console.log(`Generating icons from ${path.relative(ROOT, SOURCE)} into ${path.relative(ROOT, OUT)}/`);

const boxCx = g.minX + g.width / 2;
const boxCy = g.minY + g.height / 2;

// "any" purpose: the artwork centred on its bounding box, with room around it.
for (const size of [192, 512]) {
  const scale = (size * (1 - 2 * ANY_PADDING)) / Math.max(g.width, g.height);
  await write(`icon-${size}.png`, sharp(await placed(g, scale, size, boxCx, boxCy)));
}

// Maskable: centred on the artwork's bounding box (it looks centred in any mask shape), and
// everything that matters inside the centred circle of radius 40% (the safe zone).
for (const size of [192, 512]) {
  const outline = (12 * size) / 512;
  const safeRadius = size * 0.4;
  const scale = (safeRadius - outline - (4 * size) / 512) / g.boxRadius;
  const art = await placed(g, scale, size, boxCx, boxCy);
  const backing = await sticker(art, size, outline);
  await write(
    `maskable-${size}.png`,
    sharp({ create: { width: size, height: size, channels: 4, background: OPEN_LAND_YELLOW } }).composite([
      { input: backing },
      { input: art },
    ]),
  );
}

// Notification badge: the logo mark, drawn heavier than on screen so it survives 24 dp.
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="39" fill="none" stroke="#fff" stroke-width="10"/>
  <path d="M48 23 L70 63 L26 63 Z" fill="#fff" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
</svg>`;
  await write("badge-96.png", sharp(Buffer.from(svg), { density: 144 }).resize(96, 96));
}

console.log("Done.");
