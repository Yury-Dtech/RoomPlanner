import { describe, expect, test } from 'vitest';
import type { Room } from '../src/data/schema';
import { wallFrame, wallLength, wallPanels, wallPointToPlan } from '../src/scene/walls';

const room: Room = {
  width: 4200,
  length: 5000,
  height: 2700,
  wallThickness: 100,
  floorMaterial: { color: '#b08a5b' },
  wallMaterial: { color: '#f2efe9' },
};

describe('wall geometry', () => {
  test('wallLength: north/south use width, east/west use length', () => {
    expect(wallLength(room, 'north')).toBe(4200);
    expect(wallLength(room, 'south')).toBe(4200);
    expect(wallLength(room, 'east')).toBe(5000);
    expect(wallLength(room, 'west')).toBe(5000);
  });

  test('wallFrame matches the fixed table', () => {
    expect(wallFrame(room, 'north')).toEqual({ origin: { x: 0, z: 5000 }, dir: { x: 1, z: 0 }, inward: { x: 0, z: -1 } });
    expect(wallFrame(room, 'south')).toEqual({ origin: { x: 4200, z: 0 }, dir: { x: -1, z: 0 }, inward: { x: 0, z: 1 } });
    expect(wallFrame(room, 'east')).toEqual({ origin: { x: 4200, z: 5000 }, dir: { x: 0, z: -1 }, inward: { x: -1, z: 0 } });
    expect(wallFrame(room, 'west')).toEqual({ origin: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, inward: { x: 1, z: 0 } });
  });

  test('wallPointToPlan walks along the wall from its left corner (seen from inside)', () => {
    expect(wallPointToPlan(room, 'north', 1200)).toEqual({ x: 1200, z: 5000 });
    expect(wallPointToPlan(room, 'south', 800)).toEqual({ x: 3400, z: 0 });
    expect(wallPointToPlan(room, 'east', 1000)).toEqual({ x: 4200, z: 4000 });
    expect(wallPointToPlan(room, 'west', 1000)).toEqual({ x: 0, z: 1000 });
  });
});

describe('wallPanels', () => {
  test('door splits wall into three panels', () => {
    expect(wallPanels(4200, 2700, [{ offset: 800, width: 900, sill: 0, height: 2100 }])).toEqual([
      { u0: 0, u1: 800, v0: 0, v1: 2700 },
      { u0: 800, u1: 1700, v0: 2100, v1: 2700 },
      { u0: 1700, u1: 4200, v0: 0, v1: 2700 },
    ]);
  });

  test('window leaves panels below and above', () => {
    expect(wallPanels(4200, 2700, [{ offset: 1200, width: 1500, sill: 900, height: 1400 }])).toEqual([
      { u0: 0, u1: 1200, v0: 0, v1: 2700 },
      { u0: 1200, u1: 2700, v0: 0, v1: 900 },
      { u0: 1200, u1: 2700, v0: 2300, v1: 2700 },
      { u0: 2700, u1: 4200, v0: 0, v1: 2700 },
    ]);
  });

  test('opening at corner and up to ceiling yields no degenerate panels', () => {
    expect(wallPanels(4200, 2700, [{ offset: 0, width: 1000, sill: 0, height: 2700 }])).toEqual([
      { u0: 1000, u1: 4200, v0: 0, v1: 2700 },
    ]);
  });

  test('wall without openings is one panel', () => {
    expect(wallPanels(5000, 2700, [])).toEqual([{ u0: 0, u1: 5000, v0: 0, v1: 2700 }]);
  });

  test('two openings are ordered and gap between them is full height', () => {
    const door = { offset: 500, width: 1000, sill: 0, height: 2100 };
    const window = { offset: 2500, width: 1000, sill: 900, height: 1200 };
    const expected = [
      { u0: 0, u1: 500, v0: 0, v1: 2700 },
      { u0: 500, u1: 1500, v0: 2100, v1: 2700 },
      { u0: 1500, u1: 2500, v0: 0, v1: 2700 },
      { u0: 2500, u1: 3500, v0: 0, v1: 900 },
      { u0: 2500, u1: 3500, v0: 2100, v1: 2700 },
      { u0: 3500, u1: 4200, v0: 0, v1: 2700 },
    ];
    expect(wallPanels(4200, 2700, [door, window])).toEqual(expected);
    // input order must not matter
    expect(wallPanels(4200, 2700, [window, door])).toEqual(expected);
  });

  test('opening flush against the end of the wall leaves no trailing panel', () => {
    expect(wallPanels(4200, 2700, [{ offset: 3200, width: 1000, sill: 900, height: 1200 }])).toEqual([
      { u0: 0, u1: 3200, v0: 0, v1: 2700 },
      { u0: 3200, u1: 4200, v0: 0, v1: 900 },
      { u0: 3200, u1: 4200, v0: 2100, v1: 2700 },
    ]);
  });
});
