import polygonClipping from 'polygon-clipping';
import type { Pair, Polygon, Ring } from 'polygon-clipping';

export type { Pair, Polygon, Ring };

/** Width of the saw blade. A cut removes this thin strip of wood. */
export const KERF = 1;

export interface CutResult {
  kept: Polygon;
  removed: Polygon[];
}

/**
 * Saws `poly` along the segment a→b. The piece that contains `anchor` stays,
 * every other piece falls off. Returns null when the cut does not separate
 * anything (for example a cut that stops halfway into the board).
 */
export function cutPolygon(poly: Polygon, a: Pair, b: Pair, anchor: Pair): CutResult | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  const nx = (-uy * KERF) / 2;
  const ny = (ux * KERF) / 2;
  const blade: Ring = [
    [a[0] - nx, a[1] - ny],
    [b[0] - nx, b[1] - ny],
    [b[0] + nx, b[1] + ny],
    [a[0] + nx, a[1] + ny],
    [a[0] - nx, a[1] - ny],
  ];

  const pieces = polygonClipping.difference(snapPolygon(poly), snapPolygon([blade]));
  if (pieces.length < 2) return null;

  let keptIndex = pieces.findIndex((p) => pointInPolygon(anchor, p));
  if (keptIndex < 0) {
    keptIndex = 0;
    for (let i = 1; i < pieces.length; i++) {
      if (polygonArea(pieces[i]) > polygonArea(pieces[keptIndex])) keptIndex = i;
    }
  }
  return {
    kept: pieces[keptIndex],
    removed: pieces.filter((_, i) => i !== keptIndex),
  };
}

/** polygon-clipping can fail on float noise like 480.0000000000001, so snap inputs to a fine grid. */
const GRID = 1e-4;
export function snapPolygon(poly: Polygon): Polygon {
  return poly.map((ring) => ring.map(([x, y]) => [Math.round(x / GRID) * GRID, Math.round(y / GRID) * GRID] as Pair));
}

export function pointInRing(p: Pair, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(p: Pair, poly: Polygon): boolean {
  if (!pointInRing(p, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(p, poly[i])) return false;
  return true;
}

export function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(s) / 2;
}

export function polygonArea(poly: Polygon): number {
  return poly.reduce((sum, ring, i) => sum + (i === 0 ? ringArea(ring) : -ringArea(ring)), 0);
}

export function polygonCentroid(poly: Polygon): Pair {
  const ring = poly[0];
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return ring[0];
  return [cx / (3 * a), cy / (3 * a)];
}

export function translatePolygon(poly: Polygon, dx: number, dy: number): Polygon {
  return poly.map((ring) => ring.map(([x, y]) => [x + dx, y + dy] as Pair));
}

const FAR = 5000;

/**
 * Saws along the whole line through a and b, so the player only has to draw
 * part of the cut. Returns null when the line misses the board.
 */
export function lineCut(poly: Polygon, a: Pair, b: Pair, anchor: Pair): CutResult | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return null;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  // Reach just past the board in both directions; a much longer blade costs precision.
  let reach = 0;
  for (const [x, y] of poly[0]) reach = Math.max(reach, Math.hypot(x - a[0], y - a[1]), Math.hypot(x - b[0], y - b[1]));
  reach += 10;
  return cutPolygon(poly, [a[0] - ux * reach, a[1] - uy * reach], [b[0] + ux * reach, b[1] + uy * reach], anchor);
}

function segmentsCross(p1: Pair, p2: Pair, q1: Pair, q2: Pair): boolean {
  const d = (a: Pair, b: Pair, c: Pair) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1);
  const d2 = d(q1, q2, p2);
  const d3 = d(p1, p2, q1);
  const d4 = d(p1, p2, q2);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

/** True when the drawn segment a→b touches the board anywhere. */
export function segmentTouches(poly: Polygon, a: Pair, b: Pair): boolean {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true;
  for (const ring of poly) {
    for (let i = 1; i < ring.length; i++) if (segmentsCross(a, b, ring[i - 1], ring[i])) return true;
  }
  return false;
}

/** The part of `poly` on the same side of the line a→b as `keep`, cut without any kerf. */
export function clipToSide(poly: Polygon, a: Pair, b: Pair, keep: Pair): Polygon[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const side = Math.sign(ux * (keep[1] - a[1]) - uy * (keep[0] - a[0]));
  const nx = -uy * side * FAR;
  const ny = ux * side * FAR;
  const p: Pair = [a[0] - ux * FAR, a[1] - uy * FAR];
  const q: Pair = [a[0] + ux * FAR, a[1] + uy * FAR];
  const half: Ring = [p, q, [q[0] + nx, q[1] + ny], [p[0] + nx, p[1] + ny], p];
  return polygonClipping.intersection(poly, [half]);
}

export function circlePolygon(c: Pair, r: number, sides = 72): Polygon {
  const ring: Ring = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    ring.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  ring.push(ring[0]);
  return [ring];
}

export function multiArea(polys: Polygon[]): number {
  return polys.reduce((s, p) => s + polygonArea(p), 0);
}

export { polygonClipping };
