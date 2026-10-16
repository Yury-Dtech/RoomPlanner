import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import sample from '../src/data/project.json';
import type { Project } from '../src/data/schema';
import { defaultPerspectivePosition, orthoFrustum, perspectiveFitDistance, roomExtents } from '../src/scene/controls';
import { pickFurniture } from '../src/scene/drag';
import { FurnitureLayer, furniturePlacement } from '../src/scene/furniture';
import { buildRoom } from '../src/scene/room';

const project = sample as unknown as Project;
const room = project.room; // 4200 × 5000 × 2700, walls 100

describe('roomExtents', () => {
  test('centre is the middle of the interior in world metres (north is -Z)', () => {
    const e = roomExtents(room);
    expect(e.center.x).toBeCloseTo(2.1, 12);
    expect(e.center.z).toBeCloseTo(-2.5, 12);
  });

  test('footprint includes the walls on both sides; height is the room height', () => {
    const e = roomExtents(room);
    expect(e.width).toBeCloseTo(4.4, 12);
    expect(e.length).toBeCloseTo(5.2, 12);
    expect(e.height).toBeCloseTo(2.7, 12);
  });
});

describe('perspectiveFitDistance', () => {
  test('fits a sphere into the vertical field of view on wide screens', () => {
    expect(perspectiveFitDistance(1, 90, 2)).toBeCloseTo(Math.SQRT2, 12);
  });

  test('uses the narrower horizontal field of view on portrait screens', () => {
    const halfH = Math.atan(Math.tan(Math.PI / 6) * 0.5); // vertical fov 60°, aspect 0.5
    expect(perspectiveFitDistance(2, 60, 0.5)).toBeCloseTo(2 / Math.sin(halfH), 12);
    expect(perspectiveFitDistance(2, 60, 0.5)).toBeGreaterThan(perspectiveFitDistance(2, 60, 1));
  });
});

describe('orthoFrustum', () => {
  test('keeps the screen aspect ratio (no stretching)', () => {
    for (const aspect of [0.5, 1, 16 / 9, 3]) {
      const f = orthoFrustum(4.4, 5.2, aspect);
      expect((f.right - f.left) / (f.top - f.bottom)).toBeCloseTo(aspect, 12);
      expect(f.left).toBeCloseTo(-f.right, 12);
      expect(f.bottom).toBeCloseTo(-f.top, 12);
    }
  });

  test('the whole view rectangle fits on landscape and portrait screens', () => {
    for (const aspect of [0.4, 1, 2.5]) {
      const f = orthoFrustum(4.4, 5.2, aspect);
      expect(f.right - f.left).toBeGreaterThanOrEqual(4.4 - 1e-12);
      expect(f.top - f.bottom).toBeGreaterThanOrEqual(5.2 - 1e-12);
    }
  });

  test('is tight along the limiting side', () => {
    const wide = orthoFrustum(4, 2, 4); // height-limited
    expect(wide.top - wide.bottom).toBeCloseTo(2, 12);
    const tall = orthoFrustum(4, 2, 1); // width-limited
    expect(tall.right - tall.left).toBeCloseTo(4, 12);
  });
});

describe('defaultPerspectivePosition', () => {
  test('looks from above the walls at the room centre, at the fit distance', () => {
    const e = roomExtents(room);
    const pos = defaultPerspectivePosition(room, 16 / 9);
    const radius = Math.hypot(e.width / 2, e.length / 2, e.height);
    const centre = new THREE.Vector3(e.center.x, 0, e.center.z);
    expect(pos.distanceTo(centre)).toBeCloseTo(perspectiveFitDistance(radius, 50, 16 / 9), 9);
    expect(pos.y).toBeGreaterThan(e.height);
  });

  // The walls block picking, so an item close to the near wall must still show enough of
  // itself above it: here, at least half of each item's top face is grabbable.
  test.each([16 / 9, 1, 0.6])('every sample item can be grabbed from the default view (aspect %f)', (aspect) => {
    const scene = new THREE.Scene();
    scene.add(buildRoom(room, project.openings, { showCeiling: false }));
    new FurnitureLayer(scene).sync(project.furniture, new Map(), null);
    scene.updateMatrixWorld();
    const eye = defaultPerspectivePosition(room, aspect);
    const N = 10;
    for (const item of project.furniture) {
      const top = new THREE.Object3D();
      const pl = furniturePlacement(item);
      top.position.set(pl.position.x, pl.position.y, pl.position.z);
      top.rotation.y = pl.rotationY;
      top.updateMatrixWorld();
      let hits = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          // Cell centres of the top face, slightly below it so the ray meets the item's own box.
          const local = new THREE.Vector3(((i + 0.5) / N - 0.5) * pl.scale.x, pl.scale.y / 2 - 1e-4, ((j + 0.5) / N - 0.5) * pl.scale.z);
          const target = local.applyMatrix4(top.matrixWorld);
          const ray = new THREE.Raycaster(eye, target.clone().sub(eye).normalize());
          if (pickFurniture(ray, scene) === item.id) hits++;
        }
      }
      expect(hits / (N * N), item.id).toBeGreaterThanOrEqual(0.5);
    }
  });
});
