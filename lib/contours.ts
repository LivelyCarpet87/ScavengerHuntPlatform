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

  // Lines only need to reach just past the visible area.
  const bounds = {
    x0: (MARGIN - 1) * 10,
    y0: (MARGIN - 1) * 10,
    x1: (MARGIN + width + 1) * 10,
    y1: (MARGIN + height + 1) * 10,
  };
  const paths = polys
    .map((poly, i) => ({
      d: poly.coordinates
        .flatMap((polygon) => polygon.map((ring) => ringToPath(smooth(ring as [number, number][]), bounds)))
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

type Pt = [number, number];
type Bounds = { x0: number; y0: number; x1: number; y1: number };

/**
 * A closed ring (last point = first) as compact path data, in tenths of a
 * unit: the parts outside `bounds` are cut away (a cut ring becomes open
 * lines that run one point past the edge), repeated and exactly collinear
 * points are dropped, and coordinates are relative. The drawing is the same
 * as the full ring's inside the view; the file is about a quarter the size.
 */
function ringToPath(ring: Pt[], bounds: Bounds): string {
  if (ring.length < 4) return "";
  const pts = ring.slice(0, -1).map(([x, y]): Pt => [Math.round(x * 10), Math.round(y * 10)]);
  return clip(pts, bounds)
    .map(({ line, closed }) => polyline(simplify(line, closed), closed))
    .join("");
}

function clip(pts: Pt[], b: Bounds): { line: Pt[]; closed: boolean }[] {
  const inside = pts.map(([x, y]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
  if (inside.every(Boolean)) return [{ line: pts, closed: true }];
  // Segments are under 1.5 units long and the bounds reach 1 unit past the
  // view, so a segment between two outside points never crosses the view.
  const n = pts.length;
  const start = inside.indexOf(false);
  if (start < 0 || !inside.includes(true)) return [];
  const out: { line: Pt[]; closed: boolean }[] = [];
  let run: Pt[] | null = null;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (inside[i]) {
      run ??= [pts[(i - 1 + n) % n]];
      run.push(pts[i]);
    } else if (run) {
      run.push(pts[i]);
      out.push({ line: run, closed: false });
      run = null;
    }
  }
  return out;
}

function simplify(pts: Pt[], closed: boolean): Pt[] {
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  const d = pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]));
  if (closed && d.length > 1 && same(d[0], d[d.length - 1])) d.pop();
  if (d.length < 3) return d;
  // b can go when it lies on the straight line from a to c, between them.
  const needed = (a: Pt, b: Pt, c: Pt) => {
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    return cross !== 0 || dot <= 0;
  };
  const out: Pt[] = [d[0]];
  for (let i = 1; i < d.length - 1; i++) if (needed(out[out.length - 1], d[i], d[i + 1])) out.push(d[i]);
  out.push(d[d.length - 1]);
  if (closed) {
    if (out.length > 3 && !needed(out[out.length - 2], out[out.length - 1], out[0])) out.pop();
    if (out.length > 3 && !needed(out[out.length - 1], out[0], out[1])) out.shift();
  }
  return out;
}

/** "M12.3 4l.5-1 2 .5…z": relative moves, tenths written as ".5", no separator where none is needed. */
function polyline(pts: Pt[], closed: boolean): string {
  if (pts.length < 2) return "";
  const nums: string[] = [];
  for (let i = 1; i < pts.length; i++) nums.push(tenths(pts[i][0] - pts[i - 1][0]), tenths(pts[i][1] - pts[i - 1][1]));
  return `M${join([tenths(pts[0][0]), tenths(pts[0][1])])}l${join(nums)}${closed ? "z" : ""}`;
}

function tenths(v: number): string {
  const a = Math.abs(v);
  const whole = Math.floor(a / 10);
  const frac = a % 10;
  const s = frac ? `${whole || ""}.${frac}` : `${whole}`;
  return v < 0 ? `-${s}` : s;
}

function join(nums: string[]): string {
  let out = "";
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    const glued = n.startsWith("-") || (n.startsWith(".") && nums[i - 1]?.includes("."));
    out += i > 0 && !glued ? ` ${n}` : n;
  }
  return out;
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
