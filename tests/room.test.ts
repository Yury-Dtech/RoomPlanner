import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import sample from '../src/data/project.json';
import type { Project, Room, WallSide } from '../src/data/schema';
import { wallFrame } from '../src/scene/walls';
import { buildRoom, disposeObject, wallRectPlacement } from '../src/scene/room';

const room: Room = {
  width: 4200,
  length: 5000,
  height: 2700,
  wallThickness: 100,
  floorMaterial: { color: '#b08a5b' },
  wallMaterial: { color: '#f2efe9' },
};

describe('wallRectPlacement', () => {
  test('north wall panel: centred along the wall, pushed outward by t/2', () => {
    const p = wallRectPlacement(room, 'north', { u0: 0, u1: 1200, v0: 0, v1: 2700 });
    expect(p.center.x).toBeCloseTo(0.6);
    expect(p.center.y).toBeCloseTo(1.35);
    expect(p.center.z).toBeCloseTo(-5.05);
    expect(p.size).toEqual({ length: 1.2, height: 2.7, thickness: 0.1 });
    expect(p.rotationY).toBeCloseTo(0);
  });

  test('south wall lintel above the door sits at x 2.5…3.4 m, outside z = 0', () => {
    const p = wallRectPlacement(room, 'south', { u0: 800, u1: 1700, v0: 2100, v1: 2700 });
    expect(p.center.x).toBeCloseTo(2.95);
    expect(p.center.y).toBeCloseTo(2.4);
    expect(p.center.z).toBeCloseTo(0.05);
    expect(p.size.length).toBeCloseTo(0.9);
    expect(p.size.height).toBeCloseTo(0.6);
    expect(Math.abs(p.rotationY)).toBeCloseTo(Math.PI);
  });

  test('east and west walls are pushed outward along x', () => {
    const east = wallRectPlacement(room, 'east', { u0: 0, u1: 5000, v0: 0, v1: 2700 });
    expect(east.center.x).toBeCloseTo(4.25);
    expect(east.center.z).toBeCloseTo(-2.5);
    const west = wallRectPlacement(room, 'west', { u0: 0, u1: 5000, v0: 0, v1: 2700 });
    expect(west.center.x).toBeCloseTo(-0.05);
    expect(west.center.z).toBeCloseTo(-2.5);
  });

  test.each<WallSide>(['north', 'south', 'east', 'west'])(
    '%s: rotationY turns the box length (local +X) along the wall direction in world space',
    (wall) => {
      const { dir } = wallFrame(room, wall);
      const { rotationY } = wallRectPlacement(room, wall, { u0: 0, u1: 1, v0: 0, v1: 1 });
      const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
      // Plan direction → world direction: x stays, z flips (north is −Z).
      expect(along.x).toBeCloseTo(dir.x);
      expect(along.y).toBeCloseTo(0);
      expect(along.z).toBeCloseTo(-dir.z);
    },
  );
});

describe('buildRoom', () => {
  const openings = (sample as unknown as Project).openings;

  test('builds named floor, segmented walls, corner posts and window glass', () => {
    const group = buildRoom(room, openings, { showCeiling: false });
    const names = group.children.map((c) => c.name);
    expect(names).toContain('room-floor');
    expect(names.filter((n) => /^wall-south-\d+$/.test(n))).toHaveLength(3); // door: left, lintel, right
    expect(names.filter((n) => /^wall-north-\d+$/.test(n))).toHaveLength(4); // window: left, sill, head, right
    expect(names.filter((n) => /^wall-(east|west)-\d+$/.test(n))).toHaveLength(2);
    expect(names.filter((n) => n.startsWith('wall-corner-'))).toHaveLength(4);
    expect(names).toContain('window-glass-window-1');
    expect(names).not.toContain('room-ceiling');
  });

  test('glass fills the window hole on the north wall (x 1.2…2.7 m, sill 0.9 m)', () => {
    const glass = buildRoom(room, openings, { showCeiling: false }).getObjectByName('window-glass-window-1') as THREE.Mesh;
    const box = new THREE.Box3().setFromObject(glass);
    expect(box.min.x).toBeCloseTo(1.2);
    expect(box.max.x).toBeCloseTo(2.7);
    expect(box.min.y).toBeCloseTo(0.9);
    expect(box.max.y).toBeCloseTo(2.3);
  });

  test('ceiling is optional and back-sided', () => {
    const ceiling = buildRoom(room, openings, { showCeiling: true }).getObjectByName('room-ceiling') as THREE.Mesh;
    expect(ceiling.position.y).toBeCloseTo(2.7);
    expect((ceiling.material as THREE.Material).side).toBe(THREE.BackSide);
  });
});

describe('disposeObject', () => {
  test('disposes every geometry and each shared material once', () => {
    const group = buildRoom(room, [], { showCeiling: false });
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        materials.add(o.material as THREE.Material);
      }
    });
    let geometryDisposals = 0;
    let materialDisposals = 0;
    geometries.forEach((g) => g.addEventListener('dispose', () => geometryDisposals++));
    materials.forEach((m) => m.addEventListener('dispose', () => materialDisposals++));

    disposeObject(group);

    expect(geometryDisposals).toBe(geometries.size);
    expect(materialDisposals).toBe(materials.size);
  });
});
