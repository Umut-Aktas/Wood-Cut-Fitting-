import type { Pair, Polygon } from './geometry';

export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 800;

export interface Board {
  /** The board as it lies at the start, overlapping the other board at the corner. */
  shape: Polygon;
  /** A point near the far end. After a cut, the piece holding it stays. */
  anchor: Pair;
  /** Unit vector pointing along the wall, away from the corner. */
  along: Pair;
  width: number;
}

export interface Level {
  name: string;
  boards: [Board, Board];
  /** The piece of furniture the boards are fitted around. */
  cabinet: Polygon;
  /** Where the two inner edges meet (the cabinet corner)... */
  innerCorner: Pair;
  /** ...and where the two outer edges meet. The perfect cut runs between them. */
  outerCorner: Pair;
  maxCuts: number;
  /** Largest average gap (in world units) that still earns 3, 2 and 1 stars. */
  thresholds: readonly [number, number, number];
}

interface LevelSpec {
  name: string;
  /** Angle of the cabinet corner, in degrees. 90 is a square corner. */
  cornerAngle: number;
  /** Direction of the second wall, in degrees (0 points right). */
  rotation: number;
  widths: [number, number];
  corner: Pair;
}

const BOARD_LENGTH = 1100;
/** How far each board runs past the point where the outer edges cross. */
const OVERHANG = 45;
const DEG = Math.PI / 180;

const add = (a: Pair, b: Pair, k = 1): Pair => [a[0] + b[0] * k, a[1] + b[1] * k];
/** Clears float noise such as cos(90°) = 6e-17 so straight edges stay exactly straight. */
const tidy = (p: Pair): Pair => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
const dot = (a: Pair, b: Pair) => a[0] * b[0] + a[1] * b[1];

/** Where the lines p + s·u and q + r·v cross. */
function intersect(p: Pair, u: Pair, q: Pair, v: Pair): Pair {
  const det = u[0] * v[1] - u[1] * v[0];
  const s = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / det;
  return add(p, u, s);
}

export function buildLevel(spec: LevelSpec): Level {
  const c = spec.corner;
  const a2 = spec.rotation * DEG;
  // Screen y points down, so turning "up" from wall 2 means subtracting the angle.
  const a1 = a2 - spec.cornerAngle * DEG;
  const u: [Pair, Pair] = [
    [Math.cos(a1), Math.sin(a1)],
    [Math.cos(a2), Math.sin(a2)],
  ];
  // Each board sits on the outside of its wall, away from the cabinet.
  const n = u.map((ui, i) => {
    const other = u[1 - i];
    const perp: Pair = [-ui[1], ui[0]];
    return dot(perp, other) < 0 ? perp : ([ui[1], -ui[0]] as Pair);
  }) as [Pair, Pair];

  const outer = tidy(intersect(add(c, n[0], spec.widths[0]), u[0], add(c, n[1], spec.widths[1]), u[1]));

  const boards = [0, 1].map((i) => {
    const w = spec.widths[i];
    const start = Math.min(0, dot([outer[0] - c[0], outer[1] - c[1]], u[i])) - OVERHANG;
    const p0 = add(c, u[i], start);
    const p1 = add(c, u[i], BOARD_LENGTH);
    const ring: Pair[] = [p0, p1, add(p1, n[i], w), add(p0, n[i], w), p0].map(tidy);
    return {
      shape: [ring],
      anchor: add(add(c, u[i], BOARD_LENGTH - 30), n[i], w / 2),
      along: u[i],
      width: w,
    };
  }) as [Board, Board];

  const far = 3000;
  const cabinet: Polygon = [[c, add(c, u[0], far), add(add(c, u[0], far), u[1], far), add(c, u[1], far), c]];

  return {
    name: spec.name,
    boards,
    cabinet,
    innerCorner: c,
    outerCorner: outer,
    maxCuts: 3,
    thresholds: [0.35, 1.2, 3],
  };
}

export const LEVELS: Level[] = [
  buildLevel({ name: 'Dik köşe', cornerAngle: 90, rotation: 0, widths: [80, 80], corner: [560, 470] }),
  buildLevel({ name: 'Geniş köşe', cornerAngle: 118, rotation: 0, widths: [80, 80], corner: [620, 470] }),
  buildLevel({ name: 'Farklı genişlikler', cornerAngle: 100, rotation: -6, widths: [100, 64], corner: [600, 480] }),
  buildLevel({ name: 'Dar köşe', cornerAngle: 74, rotation: 4, widths: [70, 92], corner: [520, 470] }),
];
