import { describe, expect, test } from 'vitest';
import sample from '../src/data/project.json';
import type { FurnitureItem, Project } from '../src/data/schema';
import { findIssues, footprint, isInsideRoom, openingZone, polygonsOverlap } from '../src/scene/collisions';

const base = sample as unknown as Project;

/** Furniture item with the given plan position and footprint size (mm). */
const item = (id: string, x: number, z: number, w: number, d: number, rot = 0, h = 1000): FurnitureItem => ({
  id,
  catalogId: 'test',
  position: { x, z },
  rotationY: rot,
  size: { w, h, d },
  color: '#ffffff',
});

/** The sample room and openings with the furniture replaced. */
const projectWith = (furniture: FurnitureItem[]): Project => ({ ...structuredClone(base), furniture });

const bounds = (poly: { x: number; z: number }[]) => ({
  minX: Math.min(...poly.map((p) => p.x)),
  maxX: Math.max(...poly.map((p) => p.x)),
  minZ: Math.min(...poly.map((p) => p.z)),
  maxZ: Math.max(...poly.map((p) => p.z)),
});

describe('footprint', () => {
  test('is counter-clockwise with w along x and d along z', () => {
    const poly = footprint({ position: { x: 100, z: 200 }, rotationY: 0, size: { w: 40, h: 1, d: 20 } });
    expect(poly).toEqual([
      { x: 80, z: 190 },
      { x: 120, z: 190 },
      { x: 120, z: 210 },
      { x: 80, z: 210 },
    ]);
  });

  test('positive rotation turns counter-clockwise around the position', () => {
    const poly = footprint({ position: { x: 0, z: 0 }, rotationY: 90, size: { w: 40, h: 1, d: 20 } });
    // local (+w/2, -d/2) = (20, -10) -> (10, 20)
    expect(poly[1].x).toBeCloseTo(10);
    expect(poly[1].z).toBeCloseTo(20);
  });
});

describe('polygonsOverlap', () => {
  const square = (x: number, z: number, s: number) => footprint({ position: { x, z }, rotationY: 0, size: { w: s, h: 1, d: s } });

  test('detects real overlap, ignores touching and sub-EPS overlap', () => {
    expect(polygonsOverlap(square(0, 0, 100), square(90, 0, 100))).toBe(true);
    expect(polygonsOverlap(square(0, 0, 100), square(100, 0, 100))).toBe(false);
    expect(polygonsOverlap(square(0, 0, 100), square(99.7, 0, 100))).toBe(false);
    expect(polygonsOverlap(square(0, 0, 100), square(500, 0, 100))).toBe(false);
  });
});

describe('isInsideRoom', () => {
  test('tolerates EPS but not more', () => {
    const room = base.room;
    expect(isInsideRoom(footprint(item('a', 450, 250, 900, 500)), room)).toBe(true);
    expect(isInsideRoom(footprint(item('a', 449.7, 250, 900, 500)), room)).toBe(true);
    expect(isInsideRoom(footprint(item('a', 449, 250, 900, 500)), room)).toBe(false);
  });
});

describe('openingZone', () => {
  test('door zone is a swing square inward from the wall', () => {
    const door = base.openings.find((o) => o.id === 'door-1')!;
    const b = bounds(openingZone(door, base.room));
    expect(b).toEqual({ minX: 2500, maxX: 3400, minZ: 0, maxZ: 900 });
  });

  test('window zone is 300 mm deep', () => {
    const win = base.openings.find((o) => o.id === 'window-1')!;
    const b = bounds(openingZone(win, base.room));
    expect(b).toEqual({ minX: 1200, maxX: 2700, minZ: 4700, maxZ: 5000 });
  });
});

describe('findIssues', () => {
  test('touching walls and neighbours is not an issue', () => {
    // 900x500 at (450,250) touches the west and south walls
    expect(findIssues(projectWith([item('W', 450, 250, 900, 500)])).size).toBe(0);
    // A and B meet at x = 1000
    const a = item('A', 500, 250, 1000, 500);
    const b = item('B', 1500, 250, 1000, 500);
    expect(findIssues(projectWith([a, b])).size).toBe(0);
  });

  test('outside room by 10 mm is reported', () => {
    const issues = findIssues(projectWith([item('A', 440, 250, 900, 500)]));
    expect(issues.get('A')).toEqual([{ kind: 'outside-room' }]);
    expect(issues.size).toBe(1);
  });

  test('rotation swaps footprint extents', () => {
    // 900x500 rotated 90 deg at (250,450): x in [0,500], z in [0,900]
    expect(findIssues(projectWith([item('A', 250, 450, 900, 500, 90)])).size).toBe(0);
    // the same item unrotated: x in [-200,700]
    expect(findIssues(projectWith([item('A', 250, 450, 900, 500, 0)])).get('A')).toEqual([{ kind: 'outside-room' }]);
  });

  test('overlap is reported for both items', () => {
    const a = item('A', 500, 250, 1000, 500);
    const b = item('B', 1490, 250, 1000, 500);
    const issues = findIssues(projectWith([a, b]));
    expect(issues.get('A')).toEqual([{ kind: 'overlap', otherId: 'B' }]);
    expect(issues.get('B')).toEqual([{ kind: 'overlap', otherId: 'A' }]);
  });

  test('free rotation uses real shape, not bounding box', () => {
    // 1000x1000 rotated 45 deg at (1000,1000): the diamond tip reaches x ~ 1707
    const a = item('A', 1000, 1000, 1000, 1000, 45);
    expect(findIssues(projectWith([a, item('B', 1650, 1000, 200, 200)])).get('B')).toEqual([{ kind: 'overlap', otherId: 'A' }]);
    expect(findIssues(projectWith([a, item('B', 1850, 1000, 200, 200)])).size).toBe(0);
  });

  test('door swing zone is blocked', () => {
    // south door, offset 800, width 900 -> zone x in [2500,3400], z in [0,900]
    const blocked = findIssues(projectWith([item('A', 2950, 200, 600, 400)]));
    expect(blocked.get('A')).toEqual([{ kind: 'blocks-opening', otherId: 'door-1' }]);
    expect(findIssues(projectWith([item('A', 2950, 1200, 600, 400)])).size).toBe(0);
  });

  test('window is blocked only by items taller than sill', () => {
    // north window, offset 1200, width 1500, sill 900 -> zone x in [1200,2700], z in [4700,5000]
    const table = item('T', 1950, 4700, 1200, 600, 0, 750);
    const wardrobe = item('S', 1950, 4700, 1200, 600, 0, 2100);
    expect(findIssues(projectWith([table])).size).toBe(0);
    expect(findIssues(projectWith([wardrobe])).get('S')).toEqual([{ kind: 'blocks-opening', otherId: 'window-1' }]);
  });

  test('one item can collect several issues', () => {
    // overlaps B and covers the door zone
    const a = item('A', 2950, 200, 600, 400);
    const b = item('B', 3000, 300, 600, 400);
    const issues = findIssues(projectWith([a, b]));
    expect(issues.get('A')).toEqual([
      { kind: 'overlap', otherId: 'B' },
      { kind: 'blocks-opening', otherId: 'door-1' },
    ]);
  });

  test('bundled sample project has no issues', () => {
    expect(findIssues(base).size).toBe(0);
  });
});
