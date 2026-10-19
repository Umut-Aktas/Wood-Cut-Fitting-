import { describe, expect, it } from 'vitest';
import {
  cutPolygon,
  lineCut,
  multiArea,
  polygonArea,
  polygonClipping,
  segmentTouches,
  translatePolygon,
  type Pair,
  type Polygon,
} from '../src/geometry';
import { measureJoint } from '../src/fit';
import { LEVELS, SPECIAL_LEVEL, type Level } from '../src/level';

const square: Polygon = [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]];

describe('cutting', () => {
  it('splits a board along a full cut and keeps the anchored piece', () => {
    const r = cutPolygon(square, [-10, 30], [110, 30], [50, 90]);
    expect(r!.removed).toHaveLength(1);
    expect(polygonArea(r!.kept)).toBeCloseTo(100 * 69.5, 0);
  });

  it('a short stroke still saws all the way through the board', () => {
    const r = lineCut(square, [40, 30], [60, 30], [50, 90]);
    expect(r).not.toBeNull();
    expect(polygonArea(r!.kept)).toBeCloseTo(100 * 69.5, 0);
  });

  it('knows whether a stroke touches a board', () => {
    expect(segmentTouches(square, [40, 30], [60, 30])).toBe(true);
    expect(segmentTouches(square, [-20, 50], [120, 50])).toBe(true);
    expect(segmentTouches(square, [-20, -50], [120, -40])).toBe(false);
  });
});

/** Cuts both boards along one line, the way the player does it in the game. */
function cutBoth(level: Level, a: Pair, b: Pair): [Polygon, Polygon] {
  return level.boards.map((board) => lineCut(board.shape, a, b, board.anchor)!.kept) as [Polygon, Polygon];
}

function shifted(level: Level, d: number): [Pair, Pair] {
  const { innerCorner: c, outerCorner: o } = level;
  const len = Math.hypot(o[0] - c[0], o[1] - c[1]);
  const nx = (-(o[1] - c[1]) / len) * d;
  const ny = ((o[0] - c[0]) / len) * d;
  return [[c[0] + nx, c[1] + ny], [o[0] + nx, o[1] + ny]];
}

describe.each([...LEVELS, SPECIAL_LEVEL].map((l) => [l.name, l] as const))('%s', (_, level) => {
  it('one cut from the inner to the outer corner earns three stars', () => {
    const r = measureJoint(level, cutBoth(level, level.innerCorner, level.outerCorner));
    expect(r.stars).toBe(3);
    expect(r.fitPercent).toBeGreaterThan(90);
  });

  it('a cut a few units off the line costs stars', () => {
    const r = measureJoint(level, cutBoth(level, ...shifted(level, 12)));
    expect(r.stars).toBeLessThan(3);
  });

  it('a straight cut across both boards at the wrong angle costs stars', () => {
    const { innerCorner: c, outerCorner: o } = level;
    const tilted: Pair = [o[0] + (o[1] - c[1]) * 0.35, o[1] - (o[0] - c[0]) * 0.35];
    const r = measureJoint(level, cutBoth(level, c, tilted));
    expect(r.stars).toBeLessThan(3);
  });

  it('pushing the boards together without cutting earns nothing', () => {
    const r = measureJoint(level, [level.boards[0].shape, level.boards[1].shape]);
    expect(r.stars).toBe(0);
  });
});

describe('boards that start apart', () => {
  const level = SPECIAL_LEVEL;
  const at = (distances: [number, number]) =>
    level.boards.map((b, i) => translatePolygon(b.shape, b.along[0] * distances[i], b.along[1] * distances[i]));
  const overlap = (distances: [number, number]) => {
    const [a, b] = at(distances);
    return multiArea(polygonClipping.intersection(a, b));
  };

  it('bump into each other at the contact point', () => {
    const [c0, c1] = level.contact!;
    expect(overlap([c0, c1])).toBeLessThan(0.5);
    expect(overlap([c0 - 5, c1 - 5])).toBeGreaterThan(10);
  });

  it('rest with a gap between them', () => {
    expect(overlap(level.rest)).toBe(0);
    expect(level.rest[0]).toBeGreaterThan(level.contact![0]);
  });

  it('the overlapping levels start at home', () => {
    for (const l of LEVELS) {
      expect(l.rest).toEqual([0, 0]);
      expect(l.contact).toBeNull();
    }
  });
});
