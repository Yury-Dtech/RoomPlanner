import * as THREE from 'three';
import type { Opening, Room, WallSide } from '../data/schema';
import { mmToM, planToWorld, type Vec2 } from '../utils/units';
import { wallFrame, wallLength, wallPanels, wallPointToPlan, type WallRect } from './walls';

const WALLS: WallSide[] = ['north', 'south', 'east', 'west'];
const GLASS_COLOR = '#9cc7e6';
const GLASS_OPACITY = 0.3;

/** World-space placement of a wall box (metres, radians). Length runs along local +X. */
export interface WallBoxPlacement {
  center: { x: number; y: number; z: number };
  size: { length: number; height: number; thickness: number };
  rotationY: number;
}

/**
 * Places a wall rectangle as a box of thickness `wallThickness` built outward from the
 * interior face: centre = point on the wall at mid-u minus `inward * t/2`, y = mid-v.
 */
export function wallRectPlacement(room: Room, wall: WallSide, rect: WallRect): WallBoxPlacement {
  const t = room.wallThickness;
  const { dir, inward } = wallFrame(room, wall);
  const onWall = wallPointToPlan(room, wall, (rect.u0 + rect.u1) / 2);
  const world = planToWorld({ x: onWall.x - (inward.x * t) / 2, z: onWall.z - (inward.z * t) / 2 });
  return {
    center: { x: world.x, y: mmToM((rect.v0 + rect.v1) / 2), z: world.z },
    size: { length: mmToM(rect.u1 - rect.u0), height: mmToM(rect.v1 - rect.v0), thickness: mmToM(t) },
    // rotation.y = θ maps local +X to world (cos θ, 0, −sin θ); world dir is (dir.x, 0, −dir.z).
    rotationY: Math.atan2(dir.z, dir.x),
  };
}

function placeAt(obj: THREE.Object3D, p: WallBoxPlacement): void {
  obj.position.set(p.center.x, p.center.y, p.center.z);
  obj.rotation.y = p.rotationY;
}

/** Horizontal plane (normal +Y) covering the room interior at height `yMm`. */
function interiorPlane(room: Room, yMm: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mmToM(room.width), mmToM(room.length)), material);
  const c = planToWorld({ x: room.width / 2, z: room.length / 2 });
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(c.x, mmToM(yMm), c.z);
  return mesh;
}

/**
 * Room geometry: floor, four segmented walls around the openings (no CSG), corner posts,
 * optional ceiling and window glass. Interior dimensions; walls are built outward.
 */
export function buildRoom(room: Room, openings: Opening[], opts: { showCeiling: boolean }): THREE.Group {
  const group = new THREE.Group();
  group.name = 'room';

  const floorMat = new THREE.MeshStandardMaterial({ color: room.floorMaterial.color, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: room.wallMaterial.color, roughness: 0.95 });

  const floor = interiorPlane(room, 0, floorMat);
  floor.name = 'room-floor';
  group.add(floor);

  for (const wall of WALLS) {
    const holes = openings.filter((o) => o.wall === wall);
    const panels = wallPanels(wallLength(room, wall), room.height, holes);
    panels.forEach((rect, i) => {
      const p = wallRectPlacement(room, wall, rect);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.size.length, p.size.height, p.size.thickness), wallMat);
      mesh.name = `wall-${wall}-${i}`;
      placeAt(mesh, p);
      group.add(mesh);
    });
  }

  // Walls stop at the interior corners; posts fill the t × t gaps outside each corner.
  const t = room.wallThickness;
  const corners: Array<[string, Vec2]> = [
    ['sw', { x: -t / 2, z: -t / 2 }],
    ['se', { x: room.width + t / 2, z: -t / 2 }],
    ['ne', { x: room.width + t / 2, z: room.length + t / 2 }],
    ['nw', { x: -t / 2, z: room.length + t / 2 }],
  ];
  for (const [name, plan] of corners) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(mmToM(t), mmToM(room.height), mmToM(t)), wallMat);
    const w = planToWorld(plan);
    post.name = `wall-corner-${name}`;
    post.position.set(w.x, mmToM(room.height / 2), w.z);
    group.add(post);
  }

  if (opts.showCeiling) {
    // Double-sided: it closes the room in the outside and top views and is seen from inside too.
    // Like the walls, it hides (and blocks picking of) whatever is under it.
    const ceilingMat = new THREE.MeshStandardMaterial({ color: room.wallMaterial.color, side: THREE.DoubleSide });
    const ceiling = interiorPlane(room, room.height, ceilingMat);
    ceiling.name = 'room-ceiling';
    group.add(ceiling);
  }

  const windows = openings.filter((o) => o.type === 'window');
  if (windows.length > 0) {
    const glassMat = new THREE.MeshStandardMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: GLASS_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (const o of windows) {
      const p = wallRectPlacement(room, o.wall, { u0: o.offset, u1: o.offset + o.width, v0: o.sill, v1: o.sill + o.height });
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(p.size.length, p.size.height), glassMat);
      glass.name = `window-glass-${o.id}`;
      placeAt(glass, p);
      group.add(glass);
    }
  }

  return group;
}

/** Releases geometries and materials of the whole subtree (shared materials once). */
export function disposeObject(obj: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  obj.traverse((o) => {
    const { geometry, material } = o as Partial<THREE.Mesh>;
    geometry?.dispose();
    if (Array.isArray(material)) material.forEach((m) => materials.add(m));
    else if (material) materials.add(material);
  });
  materials.forEach((m) => m.dispose());
}
