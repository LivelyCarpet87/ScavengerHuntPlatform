import { contours } from "d3-contour";
import { createNoise2D } from "simplex-noise";
import { seededRandom } from "./seeded";

/**
 * Generative topographic contour lines. Every hunt gets its own terrain,
 * derived from its id — used as the texture on hunt headers, dashboard cards
 * and the big screen. Every fifth line is an "index contour", drawn heavier,
 * as on a real map.
 */

export type ContourMap = {
  /** SVG viewBox for the visible area. */
  viewBox: string;
  paths: { d: string; index: boolean }[];
};

type Opts = { width?: number; height?: number; levels?: number; scale?: number };

const cache = new Map<string, ContourMap>();
const MARGIN = 3;

export function contourMap(seed: string, opts: Opts = {}): ContourMap {
  const key = `${seed}|${opts.width}|${opts.height}|${opts.levels}|${opts.scale}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const width = opts.width ?? 120;
  const height = opts.height ?? 72;
  const levels = opts.levels ?? 16;
  const scale = opts.scale ?? 0.028;
  // Sample beyond the visible area so contour rings never run along the edge.
  const w = width + MARGIN * 2;
  const h = height + MARGIN * 2;

  const noise = createNoise2D(seededRandom(`terrain:${seed}`));
  const values = new Array<number>(w * h);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      let amp = 1;
      let freq = scale;
      for (let o = 0; o < 4; o++) {
        v += amp * noise(x * freq, y * freq);
        amp *= 0.45;
        freq *= 2.1;
      }
      values[y * w + x] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  const thresholds = Array.from({ length: levels }, (_, i) => min + ((max - min) * (i + 0.5)) / levels);
  const polys = contours().size([w, h]).thresholds(thresholds)(values);

  const paths = polys
    .map((poly, i) => ({
      d: poly.coordinates
        .flatMap((polygon) => polygon.map((ring) => ringToPath(smooth(ring as [number, number][]))))
        .join(""),
      index: i % 5 === 4,
    }))
    .filter((p) => p.d.length > 0);

  const map = { viewBox: `${MARGIN} ${MARGIN} ${width} ${height}`, paths };
  if (cache.size > 300) cache.clear();
  cache.set(key, map);
  return map;
}

/** One pass of Chaikin corner cutting on a closed ring. */
function smooth(ring: [number, number][]): [number, number][] {
  if (ring.length < 4) return ring;
  const pts = ring.slice(0, -1);
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
    out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
  }
  out.push(out[0]);
  return out;
}

function ringToPath(ring: [number, number][]): string {
  if (ring.length < 3) return "";
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M${ring.map(([x, y]) => `${r(x)} ${r(y)}`).join("L")}Z`;
}

const svgCache = new Map<string, string>();

/**
 * The terrain as a standalone SVG document (black lines on transparent), served
 * by /terrain/[seed] and used as a CSS mask by <ContourArt>, so pages carry a
 * cacheable URL instead of hundreds of kilobytes of inline path data.
 */
export function contourSvg(seed: string): string {
  const hit = svgCache.get(seed);
  if (hit) return hit;
  const map = contourMap(seed);
  const [, , w, h] = map.viewBox.split(" ").map(Number);
  const paths = map.paths.map((p) => `<path d="${p.d}" stroke-width="${p.index ? 1.6 : 0.8}"/>`).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${map.viewBox}" width="${w * 10}" height="${h * 10}" preserveAspectRatio="xMidYMid slice">` +
    `<style>path{fill:none;stroke:#000;stroke-linejoin:round;vector-effect:non-scaling-stroke}</style>${paths}</svg>`;
  if (svgCache.size > 500) svgCache.clear();
  svgCache.set(seed, svg);
  return svg;
}

export function isTerrainCached(seed: string): boolean {
  return svgCache.has(seed);
}
