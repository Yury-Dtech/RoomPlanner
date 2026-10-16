import { describe, expect, test } from 'vitest';
import { degToRad, mmToM, mToMm, planToWorld, worldToPlan } from '../src/utils/units';

describe('units', () => {
  test('mmToM converts millimetres to metres', () => {
    expect(mmToM(4200)).toBe(4.2);
  });

  test('mToMm converts metres to millimetres', () => {
    expect(mToMm(4.2)).toBe(4200);
  });

  test('plan to world maps north (+z) to -Z and east (+x) to +X', () => {
    expect(planToWorld({ x: 1000, z: 2000 })).toEqual({ x: 1, z: -2 });
  });

  test('world to plan round-trips', () => {
    expect(worldToPlan(planToWorld({ x: 1234, z: 567 }))).toEqual({ x: 1234, z: 567 });
  });

  test('origin maps to origin without negative zero', () => {
    expect(Object.is(planToWorld({ x: 0, z: 0 }).z, 0)).toBe(true);
    expect(Object.is(worldToPlan({ x: 0, z: 0 }).z, 0)).toBe(true);
  });

  test('degToRad converts degrees to radians', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 12);
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 12);
    expect(degToRad(0)).toBe(0);
  });
});
