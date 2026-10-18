import {
  circlePolygon,
  clipToSide,
  multiArea,
  polygonClipping,
  snapPolygon,
  translatePolygon,
  type Pair,
  type Polygon,
} from './geometry';
import type { Level } from './level';

/** Overlap (in square units) small enough to count as two boards just touching. */
const TOUCHING = 0.5;
/** Average gap at which the fit percentage reaches zero. */
const NO_FIT_GAP = 4;

export interface JointResult {
  /** How far each board slides along its wall toward the corner. Negative means it was pushed back. */
  slide: number;
  /** Area between the joint as made and a perfect joint, divided by the joint's length. */
  averageGap: number;
  /** 0–100: how close the joint is to perfect. */
  fitPercent: number;
  stars: number;
  /** Where the made joint differs from a perfect one: gaps and overhangs. */
  errors: Polygon[];
}

export function slideOffset(level: Level, i: number, slide: number): Pair {
  const u = level.boards[i].along;
  return [-u[0] * slide, -u[1] * slide];
}

function moved(level: Level, pieces: readonly Polygon[], slide: number): Polygon[] {
  return pieces.map((p, i) => snapPolygon(translatePolygon(p, ...slideOffset(level, i, slide))));
}

function overlapAt(level: Level, pieces: readonly Polygon[], slide: number): number {
  const [a, b] = moved(level, pieces, slide);
  return multiArea(polygonClipping.intersection(a, b));
}

/**
 * Pushes both boards along their walls toward the corner until they touch
 * (or pulls them apart if they overlap), then compares the joint with a
 * perfect one cut from the inner corner to the outer corner.
 */
export function measureJoint(level: Level, pieces: readonly [Polygon, Polygon]): JointResult {
  const maxSlide = 3 * Math.max(level.boards[0].width, level.boards[1].width);
  let slide: number;
  if (overlapAt(level, pieces, maxSlide) <= TOUCHING) slide = maxSlide;
  else if (overlapAt(level, pieces, -maxSlide) > TOUCHING) slide = -maxSlide;
  else {
    let lo = -maxSlide;
    let hi = maxSlide;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (overlapAt(level, pieces, mid) <= TOUCHING) lo = mid;
      else hi = mid;
    }
    slide = lo;
  }

  const { innerCorner: c, outerCorner: o } = level;
  const [b0, b1] = level.boards;
  const ideal = polygonClipping.union(clipToSide(b0.shape, c, o, b0.anchor), clipToSide(b1.shape, c, o, b1.anchor));
  const [m0, m1] = moved(level, pieces, slide);
  const actual = polygonClipping.union(m0, m1);
  const jointLength = Math.hypot(o[0] - c[0], o[1] - c[1]);
  const radius = jointLength / 2 + 1.2 * Math.max(level.boards[0].width, level.boards[1].width);
  const disc = circlePolygon([(c[0] + o[0]) / 2, (c[1] + o[1]) / 2], radius);
  const errors = polygonClipping.xor(
    polygonClipping.intersection(actual, disc),
    polygonClipping.intersection(ideal, disc),
  );
  const averageGap = multiArea(errors) / jointLength;
  const fitPercent = Math.max(0, Math.min(100, 100 * (1 - averageGap / NO_FIT_GAP)));
  return { slide, averageGap, fitPercent, stars: starsFor(averageGap, level.thresholds), errors };
}

/** `thresholds` are the largest average gaps that earn 3, 2 and 1 stars. */
export function starsFor(averageGap: number, thresholds: readonly [number, number, number]): number {
  if (averageGap <= thresholds[0]) return 3;
  if (averageGap <= thresholds[1]) return 2;
  if (averageGap <= thresholds[2]) return 1;
  return 0;
}
