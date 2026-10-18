import type { Pair, Polygon, Ring } from './geometry';

export interface Level {
  name: string;
  /** The board at the top. It never moves and can't be cut. */
  fixed: Polygon;
  /** The board the player cuts. It slides up into the fixed board. */
  moving: Polygon;
  /** The point that marks which piece of the moving board stays after a cut. */
  anchor: Pair;
  x0: number;
  x1: number;
  maxCuts: number;
  /** Lowest fit percentage that earns 3, 2 and 1 stars. */
  thresholds: readonly [number, number, number];
  /** Cuts that make the boards fit perfectly. */
  solution: readonly [Pair, Pair][];
  /** How far the moving board travels when it has been cut perfectly. */
  perfectShift: number;
}

interface Bump {
  x: number;
  height: number;
  width: number;
}

interface LevelSpec {
  name: string;
  baseline: number;
  wobble: readonly [amplitude: number, frequency: number, phase: number][];
  bumps: readonly Bump[];
  solution: readonly [Pair, Pair][];
  maxCuts: number;
  thresholds: readonly [number, number, number];
}

export const WORLD_WIDTH = 720;
export const WORLD_HEIGHT = 1280;

const X0 = 60;
const X1 = 660;
const FIXED_TOP = 150;
const MOVING_BOTTOM = 1060;
/** How far the moving board travels when it has been cut perfectly. */
const PERFECT_SHIFT = 270;
const EDGE_SAMPLES = 160;

function buildLevel(spec: LevelSpec): Level {
  const surface = (x: number) => {
    let y = spec.baseline;
    for (const [a, f, p] of spec.wobble) y += a * Math.sin(f * x + p);
    for (const b of spec.bumps) y -= b.height * Math.exp(-((x - b.x) ** 2) / (2 * b.width ** 2));
    return y;
  };

  // The edge the moving board would have after the solution cuts.
  const solved = (x: number) => {
    let y = surface(x);
    for (const [a, b] of spec.solution) {
      const lo = Math.min(a[0], b[0]);
      const hi = Math.max(a[0], b[0]);
      if (x < lo || x > hi) continue;
      const cy = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      y = Math.max(y, cy);
    }
    return y;
  };

  const xs: number[] = [];
  for (let i = 0; i <= EDGE_SAMPLES; i++) xs.push(X0 + (i / EDGE_SAMPLES) * (X1 - X0));
  // Add the cut end points so the fixed board's corners land exactly on the solution lines.
  for (const [a, b] of spec.solution) {
    for (const p of [a, b]) if (p[0] > X0 && p[0] < X1) xs.push(p[0]);
  }
  xs.sort((a, b) => a - b);

  const movingRing: Ring = xs.map((x) => [x, surface(x)] as Pair);
  movingRing.push([X1, MOVING_BOTTOM], [X0, MOVING_BOTTOM], movingRing[0]);

  const fixedEdge = xs.map((x) => [x, solved(x) - PERFECT_SHIFT] as Pair).reverse();
  const fixedRing: Ring = [[X0, FIXED_TOP], [X1, FIXED_TOP], ...fixedEdge, [X0, FIXED_TOP]];

  return {
    name: spec.name,
    fixed: [fixedRing],
    moving: [movingRing],
    anchor: [(X0 + X1) / 2, MOVING_BOTTOM - 20],
    x0: X0,
    x1: X1,
    maxCuts: spec.maxCuts,
    thresholds: spec.thresholds,
    solution: spec.solution,
    perfectShift: PERFECT_SHIFT,
  };
}

export const LEVEL_1: Level = buildLevel({
  name: 'Bölüm 1',
  baseline: 720,
  wobble: [
    [7, 0.029, 0],
    [5, 0.083, 1.3],
    [3, 0.21, 0.4],
  ],
  bumps: [
    { x: 200, height: 80, width: 38 },
    { x: 470, height: 120, width: 50 },
  ],
  solution: [
    [[120, 690], [290, 650]],
    [[350, 690], [540, 600]],
    [[400, 595], [590, 695]],
  ],
  maxCuts: 4,
  thresholds: [90, 60, 25],
});
