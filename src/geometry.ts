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

  const pieces = polygonClipping.difference(poly, [blade]);
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

/** Highest and lowest y where the vertical line at `x` meets the polygon's outline. */
export function verticalSpan(poly: Polygon, x: number): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      if (x1 > x === x2 > x) continue;
      const y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  return min <= max ? { min, max } : null;
}

export function translatePolygon(poly: Polygon, dx: number, dy: number): Polygon {
  return poly.map((ring) => ring.map(([x, y]) => [x + dx, y + dy] as Pair));
}
