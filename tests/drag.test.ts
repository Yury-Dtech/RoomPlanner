import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import {
  DRAG_THRESHOLD_PX,
  draggedPosition,
  exceedsDragThreshold,
  floorPlanPoint,
  grabOffset,
  nearestFurnitureId,
  pickFurniture,
  pointerToNdc,
} from '../src/scene/drag';
import { FurnitureLayer } from '../src/scene/furniture';
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

describe('nearestFurnitureId', () => {
  const furnitureMesh = new THREE.Object3D();
  furnitureMesh.userData.furnitureId = 'desk-1';
  const wall = new THREE.Object3D();

  test('returns the id when the nearest hit is a furniture mesh', () => {
    expect(nearestFurnitureId([{ object: furnitureMesh }, { object: wall }])).toBe('desk-1');
  });

  test('returns null when something else is in front of the furniture', () => {
    expect(nearestFurnitureId([{ object: wall }, { object: furnitureMesh }])).toBeNull();
  });

  test('returns null for no hits', () => {
    expect(nearestFurnitureId([])).toBeNull();
  });
});

describe('pickFurniture', () => {
  // Wardrobe at plan (450, 250): world x 0.45, z −0.25, spanning z 0 … −0.5, height 2.1 m.
  function setup(withWall: boolean): { root: THREE.Scene; layer: FurnitureLayer } {
    const root = new THREE.Scene();
    const layer = new FurnitureLayer(root);
    layer.sync(
      [{ id: 'wardrobe-1', catalogId: 'wardrobe-basic', position: { x: 450, z: 250 }, rotationY: 0, size: { w: 900, h: 2100, d: 500 }, color: '#ffffff' }],
      new Map(),
      'wardrobe-1', // the selection outline must not block picking
    );
    if (withWall) {
      // South wall: outside the room, z 0 … +0.1 (100 mm thick).
      const wall = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.7, 0.1), new THREE.MeshStandardMaterial());
      wall.position.set(2.1, 1.35, 0.05);
      root.add(wall);
    }
    root.updateMatrixWorld();
    return { root, layer };
  }
  // From the south, outside the room, looking north (−Z) at the wardrobe.
  const raycasterFromSouth = (): THREE.Raycaster =>
    new THREE.Raycaster(new THREE.Vector3(0.45, 1, 3), new THREE.Vector3(0, 0, -1));

  test('picks a visible item', () => {
    const { root } = setup(false);
    expect(pickFurniture(raycasterFromSouth(), root)).toBe('wardrobe-1');
  });

  test('does not pick an item hidden behind a wall', () => {
    const { root } = setup(true);
    expect(pickFurniture(raycasterFromSouth(), root)).toBeNull();
  });
});
