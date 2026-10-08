// Camera motion between two consecutive frames of the live world, from a
// coarse optical flow: the frame is shrunk to FLOW_WIDTH × FLOW_HEIGHT grey,
// each textured 8×8 block is found again in the next frame (block matching
// with sub-pixel refinement), and the block motions are fitted to
//
//   u = shiftX + divergence · x        v = shiftY + divergence · y
//
// with (x, y) measured from the frame centre. For a camera following a walker:
//   - shiftX is the camera panning — turning (content slides left as it turns right);
//   - divergence > 0 is the scene expanding — walking forward;
//   - both near zero is standing still.
// Blocks that disagree with the fit (pedestrians, cars) are dropped and the
// fit is redone. Pure math on byte arrays, so it runs anywhere.

export const FLOW_WIDTH = 160;
export const FLOW_HEIGHT = 90;

const BLOCK = 8;
const STEP = 10;
const RADIUS = 8;
const MIN_VARIANCE = 60;
const MIN_SAMPLES = 12;
const KEEP_FRACTION = 0.7;
const INLIER_PX = 1.5;

export interface Flow {
  /** Horizontal image shift, px/frame at FLOW_WIDTH. */
  shiftX: number;
  /** Vertical image shift, px/frame. */
  shiftY: number;
  /** Fractional expansion per frame; positive when moving forward. */
  divergence: number;
  /** Blocks that agree with the fit, of those measured. */
  inliers: number;
  samples: number;
}

/** RGBA pixels → luma, reusing `out` when given. */
export function toGray(rgba: Uint8ClampedArray, out?: Uint8Array): Uint8Array {
  const gray = out ?? new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return gray;
}

interface Sample {
  x: number;
  y: number;
  u: number;
  v: number;
}

export function estimateFlow(
  prev: Uint8Array,
  curr: Uint8Array,
  w = FLOW_WIDTH,
  h = FLOW_HEIGHT,
): Flow | null {
  const samples: Sample[] = [];
  const span = 2 * RADIUS + 1;
  const sads = new Float64Array(span * span);
  for (let by = RADIUS; by + BLOCK + RADIUS <= h; by += STEP) {
    for (let bx = RADIUS; bx + BLOCK + RADIUS <= w; bx += STEP) {
      if (variance(prev, w, bx, by) < MIN_VARIANCE) continue;
      let best = Infinity;
      let bestDx = 0;
      let bestDy = 0;
      let total = 0;
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          let sad = 0;
          for (let y = 0; y < BLOCK; y++) {
            const p = (by + y) * w + bx;
            const c = (by + y + dy) * w + bx + dx;
            for (let x = 0; x < BLOCK; x++) sad += Math.abs(prev[p + x] - curr[c + x]);
          }
          sads[(dy + RADIUS) * span + dx + RADIUS] = sad;
          total += sad;
          if (sad < best) {
            best = sad;
            bestDx = dx;
            bestDy = dy;
          }
        }
      }
      // At the edge of the search window the true match may lie outside it;
      // a best match barely better than average is ambiguous texture.
      if (Math.abs(bestDx) === RADIUS || Math.abs(bestDy) === RADIUS) continue;
      if (best > 0.6 * (total / sads.length)) continue;
      const at = (dy: number, dx: number) => sads[(dy + RADIUS) * span + dx + RADIUS];
      samples.push({
        x: bx + BLOCK / 2 - w / 2,
        y: by + BLOCK / 2 - h / 2,
        u: bestDx + parabola(at(bestDy, bestDx - 1), best, at(bestDy, bestDx + 1)),
        v: bestDy + parabola(at(bestDy - 1, bestDx), best, at(bestDy + 1, bestDx)),
      });
    }
  }
  if (samples.length < MIN_SAMPLES) return null;

  let fit = fitModel(samples);
  const ranked = samples
    .map((s) => ({ s, r: residual(s, fit) }))
    .sort((a, b) => a.r - b.r);
  const kept = ranked.slice(0, Math.max(MIN_SAMPLES, Math.round(ranked.length * KEEP_FRACTION)));
  fit = fitModel(kept.map((k) => k.s));
  const inliers = samples.filter((s) => residual(s, fit) < INLIER_PX).length;
  return { ...fit, inliers, samples: samples.length };
}

function variance(img: Uint8Array, w: number, bx: number, by: number): number {
  let sum = 0;
  let sq = 0;
  for (let y = 0; y < BLOCK; y++) {
    const row = (by + y) * w + bx;
    for (let x = 0; x < BLOCK; x++) {
      const v = img[row + x];
      sum += v;
      sq += v * v;
    }
  }
  const n = BLOCK * BLOCK;
  return sq / n - (sum / n) ** 2;
}

/** Sub-pixel offset of a minimum from its two neighbours' costs. */
function parabola(left: number, mid: number, right: number): number {
  const denom = left - 2 * mid + right;
  return denom > 0 ? (left - right) / (2 * denom) : 0;
}

function fitModel(samples: Sample[]): Pick<Flow, "shiftX" | "shiftY" | "divergence"> {
  const n = samples.length;
  let mx = 0, my = 0, mu = 0, mv = 0;
  for (const s of samples) {
    mx += s.x; my += s.y; mu += s.u; mv += s.v;
  }
  mx /= n; my /= n; mu /= n; mv /= n;
  let num = 0;
  let den = 0;
  for (const s of samples) {
    num += (s.x - mx) * (s.u - mu) + (s.y - my) * (s.v - mv);
    den += (s.x - mx) ** 2 + (s.y - my) ** 2;
  }
  const divergence = den > 0 ? num / den : 0;
  return { divergence, shiftX: mu - divergence * mx, shiftY: mv - divergence * my };
}

function residual(s: Sample, f: Pick<Flow, "shiftX" | "shiftY" | "divergence">): number {
  return Math.hypot(
    s.u - (f.shiftX + f.divergence * s.x),
    s.v - (f.shiftY + f.divergence * s.y),
  );
}
