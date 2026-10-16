import * as THREE from 'three';
import type { FurnitureItem } from '../data/schema';
import { degToRad, mmToM, planToWorld } from '../utils/units';
import type { Issue } from './collisions';

const ISSUE_COLOR = '#e5484d';
const SELECTION_COLOR = '#2563eb';
/** The outline is a hair larger than the box so its lines never z-fight with the faces. */
const OUTLINE_SCALE = 1.004;

/** World-space transform of a unit box (1 × 1 × 1, centred) drawn for a furniture item. */
export interface FurniturePlacement {
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotationY: number;
}

/**
 * Plan → world for an item: centre on the plan position, resting on the floor (y = h/2),
 * local X = w, Y = h, Z = d. Positive `rotationY` (CCW from above) maps directly to
 * `rotation.y` because north is world −Z — the base matches `footprint()` from collisions.
 */
export function furniturePlacement(item: Pick<FurnitureItem, 'position' | 'rotationY' | 'size'>): FurniturePlacement {
  const p = planToWorld(item.position);
  return {
    position: { x: p.x, y: mmToM(item.size.h / 2), z: p.z },
    scale: { x: mmToM(item.size.w), y: mmToM(item.size.h), z: mmToM(item.size.d) },
    rotationY: degToRad(item.rotationY),
  };
}

type FurnitureMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

/**
 * Furniture as boxes, reconciled by id on every `sync`: meshes are reused, never rebuilt.
 * All meshes share one unit geometry; each owns its material (colours differ). Items with
 * issues are painted red; the selected one gets an edge outline.
 */
export class FurnitureLayer {
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  private readonly meshes = new Map<string, FurnitureMesh>();

  constructor(parent: THREE.Object3D) {
    this.group.name = 'furniture';
    parent.add(this.group);

    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.geometry),
      new THREE.LineBasicMaterial({ color: SELECTION_COLOR }),
    );
    this.outline.name = 'furniture-selection';
    this.outline.scale.setScalar(OUTLINE_SCALE);
    // Decoration only: never a raycast hit, even when the whole scene is picked.
    this.outline.raycast = () => {};
  }

  sync(items: FurnitureItem[], issues: Map<string, Issue[]>, selectedId: string | null): void {
    const present = new Set<string>();
    for (const item of items) {
      present.add(item.id);
      const mesh = this.meshes.get(item.id) ?? this.create(item.id);
      const p = furniturePlacement(item);
      mesh.position.set(p.position.x, p.position.y, p.position.z);
      mesh.scale.set(p.scale.x, p.scale.y, p.scale.z);
      mesh.rotation.y = p.rotationY;
      mesh.userData.color = item.color;
      const hasIssues = (issues.get(item.id)?.length ?? 0) > 0;
      mesh.material.color.set(hasIssues ? ISSUE_COLOR : item.color);
    }

    for (const [id, mesh] of this.meshes) {
      if (present.has(id)) continue;
      this.group.remove(mesh);
      mesh.material.dispose(); // the shared geometry stays until dispose()
      this.meshes.delete(id);
    }

    const selected = selectedId === null ? undefined : this.meshes.get(selectedId);
    if (selected) selected.add(this.outline);
    else this.outline.removeFromParent();
  }

  /** Id of the nearest furniture item hit by the ray, or null. */
  pick(raycaster: THREE.Raycaster): string | null {
    const [hit] = raycaster.intersectObjects([...this.meshes.values()], false);
    return hit ? (hit.object.userData.furnitureId as string) : null;
  }

  meshFor(id: string): THREE.Object3D | undefined {
    return this.meshes.get(id);
  }

  dispose(): void {
    this.outline.removeFromParent();
    this.group.removeFromParent();
    for (const mesh of this.meshes.values()) mesh.material.dispose();
    this.meshes.clear();
    this.geometry.dispose();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
  }

  private create(id: string): FurnitureMesh {
    const mesh: FurnitureMesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ roughness: 0.8 }));
    mesh.name = `furniture-${id}`;
    mesh.userData.furnitureId = id;
    this.meshes.set(id, mesh);
    this.group.add(mesh);
    return mesh;
  }
}
