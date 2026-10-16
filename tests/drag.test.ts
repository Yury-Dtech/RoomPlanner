import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import {
  DRAG_THRESHOLD_PX,
  draggedPosition,
  exceedsDragThreshold,
  floorPlanPoint,
  grabOffset,
  pointerToNdc,
} from '../src/scene/drag';
import { planToWorld } from '../src/utils/units';

const rect = { left: 100, top: 50, width: 800, height: 600 };

describe('pointerToNdc', () => {
  test('maps the element centre to the origin', () => {
    const ndc = pointerToNdc(500, 350, rect);
    expect(ndc.x).toBeCloseTo(0, 12);
    expect(ndc.y).toBeCloseTo(0, 12);
  });

  test('maps the top-left corner to (-1, 1) and the bottom-right to (1, -1)', () => {
    expect(pointerToNdc(100, 50, rect).toArray()).toEqual([-1, 1]);
    expect(pointerToNdc(900, 650, rect).toArray()).toEqual([1, -1]);
  });
});

describe('floorPlanPoint', () => {
  test('returns the plan position (mm) where the ray meets the floor y = 0', () => {
    const w = planToWorld({ x: 1500, z: 2000 });
    const ray = new THREE.Ray(new THREE.Vector3(w.x, 3, w.z), new THREE.Vector3(0, -1, 0));
    const p = floorPlanPoint(ray)!;
    expect(p.x).toBeCloseTo(1500, 6);
    expect(p.z).toBeCloseTo(2000, 6);
  });

  test('follows an oblique ray to the floor', () => {
    // From (0, 2, 0) towards +X and down at 45°: hits the floor at world x = 2 → plan x = 2000.
    const ray = new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, -1, 0).normalize());
    const p = floorPlanPoint(ray)!;
    expect(p.x).toBeCloseTo(2000, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  test('returns null when the ray points away from or parallel to the floor', () => {
    expect(floorPlanPoint(new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, 0)))).toBeNull();
    expect(floorPlanPoint(new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 0, 0)))).toBeNull();
  });
});

describe('grab offset', () => {
  test('grabbing at the centre keeps the centre under the pointer', () => {
    const offset = grabOffset({ x: 1950, z: 4700 }, { x: 1950, z: 4700 });
    expect(draggedPosition({ x: 1000, z: 3000 }, offset)).toEqual({ x: 1000, z: 3000 });
  });

  test('an off-centre grab moves the centre by exactly the pointer delta (no jump)', () => {
    const item = { x: 1950, z: 4700 };
    const grab = { x: 2000, z: 4600 };
    const offset = grabOffset(item, grab);
    // Not moved yet: the item stays where it is.
    expect(draggedPosition(grab, offset)).toEqual(item);
    // Pointer moved by (+500, -600) → centre moved by the same delta.
    expect(draggedPosition({ x: 2500, z: 4000 }, offset)).toEqual({ x: 2450, z: 4100 });
  });
});

describe('exceedsDragThreshold', () => {
  test('small jitter is still a click, a longer move is a drag', () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThan(0);
    expect(exceedsDragThreshold(0, 0)).toBe(false);
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX, 0)).toBe(false);
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX + 1, 0)).toBe(true);
    expect(exceedsDragThreshold(-3, 4)).toBe(true); // length 5
  });
});
