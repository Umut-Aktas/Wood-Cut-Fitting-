import { describe, expect, it } from 'vitest';
import { cutPolygon, polygonArea, type Polygon } from '../src/geometry';
import { measureFit } from '../src/fit';
import { LEVEL_1 } from '../src/level';

const square: Polygon = [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]];

describe('cutPolygon', () => {
  it('splits a board along a full cut and keeps the anchored piece', () => {
    const r = cutPolygon(square, [-10, 30], [110, 30], [50, 90]);
    expect(r).not.toBeNull();
    expect(r!.removed).toHaveLength(1);
    expect(polygonArea(r!.kept)).toBeCloseTo(100 * 69.5, 0);
  });

  it('rejects a cut that stops inside the board', () => {
    expect(cutPolygon(square, [-10, 30], [60, 30], [50, 90])).toBeNull();
  });

  it('rejects a cut that misses the board', () => {
    expect(cutPolygon(square, [-10, -30], [110, -20], [50, 90])).toBeNull();
  });
});

describe('level 1', () => {
  const fit = (p: Polygon) => measureFit(LEVEL_1.fixed, p, LEVEL_1.x0, LEVEL_1.x1, LEVEL_1.thresholds);

  it('every solution cut removes a piece', () => {
    let board = LEVEL_1.moving;
    for (const [a, b] of LEVEL_1.solution) {
      const r = cutPolygon(board, a, b, LEVEL_1.anchor);
      expect(r).not.toBeNull();
      board = r!.kept;
    }
  });

  it('the solution earns three stars', () => {
    let board = LEVEL_1.moving;
    for (const [a, b] of LEVEL_1.solution) board = cutPolygon(board, a, b, LEVEL_1.anchor)!.kept;
    const r = fit(board);
    expect(r.stars).toBe(3);
    expect(r.fitPercent).toBeGreaterThan(98);
  });

  it('pushing the boards together without cutting earns nothing', () => {
    expect(fit(LEVEL_1.moving).stars).toBe(0);
  });

  const withFirstCutShifted = (dy: number) => {
    let board = LEVEL_1.moving;
    LEVEL_1.solution.forEach(([a, b], i) => {
      const d = i === 0 ? dy : 0;
      board = cutPolygon(board, [a[0], a[1] + d], [b[0], b[1] + d], LEVEL_1.anchor)!.kept;
    });
    return fit(board);
  };

  it('a cut a little too deep still earns three stars', () => {
    expect(withFirstCutShifted(3).stars).toBe(3);
  });

  it('a cut far too deep leaves a gap and costs stars', () => {
    expect(withFirstCutShifted(10).stars).toBe(2);
  });

  it('a cut too shallow holds the whole board away and costs more', () => {
    expect(withFirstCutShifted(-8).stars).toBeLessThanOrEqual(1);
  });
});
