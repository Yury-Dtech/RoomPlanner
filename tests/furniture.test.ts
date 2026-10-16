import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import type { FurnitureItem } from '../src/data/schema';
import type { Issue } from '../src/scene/collisions';
import { footprint } from '../src/scene/collisions';
import { FurnitureLayer, furniturePlacement } from '../src/scene/furniture';
import { planToWorld } from '../src/utils/units';

function item(overrides: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: 'wardrobe-1',
    catalogId: 'wardrobe-basic',
    position: { x: 450, z: 250 },
    rotationY: 0,
    size: { w: 900, h: 2100, d: 500 },
    color: '#ffffff',
    ...overrides,
  };
}

/** Base corners (y = 0) of a unit box placed by `furniturePlacement`, in world space. */
function worldBaseCorners(it: FurnitureItem): THREE.Vector3[] {
  const p = furniturePlacement(it);
  const obj = new THREE.Object3D();
  obj.position.set(p.position.x, p.position.y, p.position.z);
  obj.scale.set(p.scale.x, p.scale.y, p.scale.z);
  obj.rotation.y = p.rotationY;
  obj.updateMatrixWorld();
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].map(([x, z]) => new THREE.Vector3(x, -0.5, z).applyMatrix4(obj.matrixWorld));
}

/** Every footprint corner (plan → world) matches some base corner of the placed box. */
function expectSameCorners(actual: THREE.Vector3[], it: FurnitureItem): void {
  const expected = footprint(it).map(planToWorld);
  expect(actual.every((c) => Math.abs(c.y) < 1e-9)).toBe(true);
  for (const e of expected) {
    const match = actual.some((c) => Math.abs(c.x - e.x) < 1e-9 && Math.abs(c.z - e.z) < 1e-9);
    expect(match, `corner (${e.x}, ${e.z}) not found`).toBe(true);
  }
}

describe('furniturePlacement', () => {
  test('rotation 0: centre at plan position, standing on the floor, scaled to size in metres', () => {
    const p = furniturePlacement(item());
    expect(p.position.x).toBeCloseTo(0.45);
    expect(p.position.y).toBeCloseTo(1.05);
    expect(p.position.z).toBeCloseTo(-0.25);
    expect(p.scale).toEqual({ x: 0.9, y: 2.1, z: 0.5 });
    expect(p.rotationY).toBe(0);
  });

  test('rotation 0: base corners agree with the collision footprint', () => {
    const it = item();
    expectSameCorners(worldBaseCorners(it), it);
  });

  test('rotation 90: w runs along plan z, base corners agree with the collision footprint', () => {
    const it = item({ id: 'bed-1', position: { x: 3200, z: 2500 }, rotationY: 90, size: { w: 1600, h: 450, d: 2000 } });
    expect(furniturePlacement(it).rotationY).toBeCloseTo(Math.PI / 2);
    const corners = worldBaseCorners(it);
    expectSameCorners(corners, it);
    // Extents: 2000 along x (3.2 ± 1.0 m), 1600 along z (−2.5 ± 0.8 m).
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    expect(Math.min(...xs)).toBeCloseTo(2.2);
    expect(Math.max(...xs)).toBeCloseTo(4.2);
    expect(Math.min(...zs)).toBeCloseTo(-3.3);
    expect(Math.max(...zs)).toBeCloseTo(-1.7);
  });

  test('rotation 30: base corners agree with the collision footprint', () => {
    const it = item({ rotationY: 30 });
    expectSameCorners(worldBaseCorners(it), it);
  });
});

describe('FurnitureLayer', () => {
  const none = new Map<string, Issue[]>();

  function setup() {
    const parent = new THREE.Group();
    const layer = new FurnitureLayer(parent);
    return { parent, layer };
  }

  function material(obj: THREE.Object3D | undefined): THREE.MeshStandardMaterial {
    return (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
  }

  test('creates one mesh per item, tagged with its id and placed by furniturePlacement', () => {
    const { layer } = setup();
    const bed = item({ id: 'bed-1', position: { x: 3200, z: 2500 }, rotationY: 90 });
    layer.sync([item(), bed], none, null);

    const mesh = layer.meshFor('bed-1') as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.userData.furnitureId).toBe('bed-1');
    const p = furniturePlacement(bed);
    expect(mesh.position.x).toBeCloseTo(p.position.x);
    expect(mesh.position.y).toBeCloseTo(p.position.y);
    expect(mesh.position.z).toBeCloseTo(p.position.z);
    expect(mesh.rotation.y).toBeCloseTo(p.rotationY);
    expect(mesh.scale.x).toBeCloseTo(p.scale.x);
    expect(layer.meshFor('wardrobe-1')).toBeDefined();
  });

  test('reconciles by id: updates in place, adds new, removes missing', () => {
    const { layer } = setup();
    layer.sync([item(), item({ id: 'desk-1' })], none, null);
    const wardrobe = layer.meshFor('wardrobe-1');
    const desk = layer.meshFor('desk-1') as THREE.Mesh;
    let deskDisposed = false;
    (desk.material as THREE.Material).addEventListener('dispose', () => (deskDisposed = true));

    layer.sync([item({ position: { x: 1000, z: 250 } }), item({ id: 'bed-1' })], none, null);

    expect(layer.meshFor('wardrobe-1')).toBe(wardrobe);
    expect(wardrobe?.position.x).toBeCloseTo(1.0);
    expect(layer.meshFor('bed-1')).toBeDefined();
    expect(layer.meshFor('desk-1')).toBeUndefined();
    expect(desk.parent).toBeNull();
    expect(deskDisposed).toBe(true);
  });

  test('items with issues are red; the original colour is kept and restored', () => {
    const { layer } = setup();
    const issues = new Map<string, Issue[]>([['wardrobe-1', [{ kind: 'outside-room' }]]]);
    layer.sync([item({ color: '#123456' })], issues, null);
    const mesh = layer.meshFor('wardrobe-1');
    expect(material(mesh).color.getHexString()).toBe('e5484d');
    expect(mesh?.userData.color).toBe('#123456');

    layer.sync([item({ color: '#123456' })], none, null);
    expect(material(mesh).color.getHexString()).toBe('123456');
  });

  test('each mesh owns its material, all meshes share one geometry', () => {
    const { layer } = setup();
    layer.sync([item(), item({ id: 'desk-1', color: '#8b6b4a' })], none, null);
    const a = layer.meshFor('wardrobe-1') as THREE.Mesh;
    const b = layer.meshFor('desk-1') as THREE.Mesh;
    expect(a.material).not.toBe(b.material);
    expect(a.geometry).toBe(b.geometry);
  });

  test('selection outline follows selectedId and disappears when cleared', () => {
    const { layer } = setup();
    const items = [item(), item({ id: 'desk-1' })];
    const outlines = (obj: THREE.Object3D | undefined) =>
      obj?.children.filter((c): c is THREE.LineSegments => c instanceof THREE.LineSegments) ?? [];

    layer.sync(items, none, 'desk-1');
    const [outline] = outlines(layer.meshFor('desk-1'));
    expect(outline).toBeDefined();
    expect((outline.material as THREE.LineBasicMaterial).color.getHexString()).toBe('2563eb');
    expect(outlines(layer.meshFor('wardrobe-1'))).toHaveLength(0);

    layer.sync(items, none, 'wardrobe-1');
    expect(outlines(layer.meshFor('desk-1'))).toHaveLength(0);
    expect(outlines(layer.meshFor('wardrobe-1'))).toHaveLength(1);

    layer.sync(items, none, null);
    expect(outlines(layer.meshFor('wardrobe-1'))).toHaveLength(0);

    layer.sync(items, none, 'missing-id');
    expect(outlines(layer.meshFor('wardrobe-1'))).toHaveLength(0);
    expect(outlines(layer.meshFor('desk-1'))).toHaveLength(0);
  });

  test('pick returns the id of the hit item and ignores the selection outline', () => {
    const { parent, layer } = setup();
    layer.sync([item()], none, 'wardrobe-1');
    parent.updateMatrixWorld();

    const down = new THREE.Vector3(0, -1, 0);
    const hit = new THREE.Raycaster(new THREE.Vector3(0.45, 5, -0.25), down);
    expect(layer.pick(hit)).toBe('wardrobe-1');

    // Just outside the box, still within the outline's line-picking threshold.
    const miss = new THREE.Raycaster(new THREE.Vector3(0.91, 5, -0.25), down);
    miss.params.Line = { threshold: 0.1 };
    expect(layer.pick(miss)).toBeNull();
  });

  test('dispose detaches the layer and releases the shared geometry once', () => {
    const { parent, layer } = setup();
    layer.sync([item(), item({ id: 'desk-1' })], none, 'desk-1');
    const geometry = (layer.meshFor('desk-1') as THREE.Mesh).geometry;
    let disposals = 0;
    geometry.addEventListener('dispose', () => disposals++);
    const childrenBefore = parent.children.length;

    layer.sync([item()], none, null); // removing an item must not dispose the shared geometry
    expect(disposals).toBe(0);

    layer.dispose();
    expect(disposals).toBe(1);
    expect(parent.children.length).toBe(childrenBefore - 1);
  });
});
