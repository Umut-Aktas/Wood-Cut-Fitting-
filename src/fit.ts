import { verticalSpan, type Polygon } from './geometry';

/** Gap counted for a column where the moving board has no wood at all. */
const MISSING_WOOD_GAP = 40;
const SAMPLES = 300;
/** A column with a gap up to this size counts as a perfect fit... */
const TIGHT_GAP = 1;
/** ...and one with a gap this much larger counts as no fit at all. */
const LOOSE_RANGE = 8;

export interface FitColumn {
  x: number;
  /** Bottom edge of the fixed board. */
  top: number;
  /** Top edge of the moving board after it has slid into place, or null when it has no wood here. */
  bottom: number | null;
  gap: number;
}

export interface FitResult {
  /** How far the moving board slides up before it touches the fixed board. */
  shift: number;
  meanGap: number;
  /** 0–100: how much of the edge sits tight against the fixed board. */
  fitPercent: number;
  columns: FitColumn[];
  stars: number;
}

/**
 * Slides `moving` straight up until it touches `fixed`, then measures the
 * gap left between the two edges across [x0, x1].
 */
export function measureFit(
  fixed: Polygon,
  moving: Polygon,
  x0: number,
  x1: number,
  thresholds: readonly [number, number, number],
): FitResult {
  const raw: { x: number; top: number; bottom: number | null }[] = [];
  let shift = Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    const x = x0 + ((i + 0.5) / SAMPLES) * (x1 - x0);
    const top = verticalSpan(fixed, x)?.max;
    if (top === undefined) continue;
    const bottom = verticalSpan(moving, x)?.min ?? null;
    if (bottom !== null) shift = Math.min(shift, bottom - top);
    raw.push({ x, top, bottom });
  }
  if (!Number.isFinite(shift)) shift = 0;

  const columns = raw.map(({ x, top, bottom }) => {
    if (bottom === null) return { x, top, bottom, gap: MISSING_WOOD_GAP };
    const placed = bottom - shift;
    return { x, top, bottom: placed, gap: placed - top };
  });
  const n = Math.max(columns.length, 1);
  const meanGap = columns.reduce((s, c) => s + c.gap, 0) / n;
  const tightness = columns.reduce(
    (s, c) => s + Math.min(1, Math.max(0, 1 - (c.gap - TIGHT_GAP) / LOOSE_RANGE)),
    0,
  );
  const fitPercent = (100 * tightness) / n;
  return { shift, meanGap, fitPercent, columns, stars: starsFor(fitPercent, thresholds) };
}

/** `thresholds` are the lowest fit percentages that earn 3, 2 and 1 stars. */
export function starsFor(fitPercent: number, thresholds: readonly [number, number, number]): number {
  if (fitPercent >= thresholds[0]) return 3;
  if (fitPercent >= thresholds[1]) return 2;
  if (fitPercent >= thresholds[2]) return 1;
  return 0;
}
