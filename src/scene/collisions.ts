import type { FurnitureItem, Opening, Project, Room } from '../data/schema';
import { degToRad, type Vec2 } from '../utils/units';
import { wallFrame, wallPointToPlan } from './walls';

/** Touching tolerance, mm: contact (or a smaller overlap) is not a violation. */
export const EPS = 0.5;
/** Depth of the zone in front of a window that tall furniture must keep free, mm. */
export const WINDOW_CLEARANCE = 300;

export type IssueKind = 'outside-room' | 'overlap' | 'blocks-opening';

export interface Issue {
  kind: IssueKind;
  /** Id of the other furniture item or of the opening involved. */
  otherId?: string;
}

/** Four corners of the item's base on the plan, counter-clockwise. */
export function footprint(item: Pick<FurnitureItem, 'position' | 'rotationY' | 'size'>): Vec2[] {
  const hw = item.size.w / 2;
  const hd = item.size.d / 2;
  const a = degToRad(item.rotationY);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const corners: Vec2[] = [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ];
  return corners.map((c) => ({
    x: item.position.x + c.x * cos - c.z * sin,
    z: item.position.z + c.x * sin + c.z * cos,
  }));
}

export function isInsideRoom(poly: Vec2[], room: Room): boolean {
  return poly.every(
    (p) => p.x >= -EPS && p.x <= room.width + EPS && p.z >= -EPS && p.z <= room.length + EPS,
  );
}

function projectOnto(poly: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * axis.x + p.z * axis.z;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/** Separating-axis test for convex polygons. Penetration of `EPS` or less does not count. */
export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      if (len === 0) continue;
      const axis = { x: (q.z - p.z) / len, z: (p.x - q.x) / len };
      const pa = projectOnto(a, axis);
      const pb = projectOnto(b, axis);
      if (Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min) <= EPS) return false;
    }
  }
  return true;
}

/** Floor area in front of an opening that furniture must keep free (door swing, window clearance). */
export function openingZone(opening: Opening, room: Room): Vec2[] {
  const depth = opening.type === 'door' ? opening.width : WINDOW_CLEARANCE;
  const { inward } = wallFrame(room, opening.wall);
  const start = wallPointToPlan(room, opening.wall, opening.offset);
  const end = wallPointToPlan(room, opening.wall, opening.offset + opening.width);
  const shift = (p: Vec2): Vec2 => ({ x: p.x + inward.x * depth, z: p.z + inward.z * depth });
  return [start, end, shift(end), shift(start)];
}

/** Violations per furniture id; only items with at least one violation are present. */
export function findIssues(project: Project): Map<string, Issue[]> {
  const result = new Map<string, Issue[]>();
  const add = (id: string, issue: Issue): void => {
    const list = result.get(id);
    if (list) list.push(issue);
    else result.set(id, [issue]);
  };

  const items = project.furniture.map((item) => ({ item, poly: footprint(item) }));
  const zones = project.openings.map((opening) => ({ opening, poly: openingZone(opening, project.room) }));

  items.forEach(({ item, poly }, i) => {
    if (!isInsideRoom(poly, project.room)) add(item.id, { kind: 'outside-room' });

    items.forEach((other, j) => {
      if (i !== j && polygonsOverlap(poly, other.poly)) add(item.id, { kind: 'overlap', otherId: other.item.id });
    });

    for (const { opening, poly: zone } of zones) {
      // A window only matters for items that reach above its sill.
      if (opening.type === 'window' && item.size.h <= opening.sill) continue;
      if (polygonsOverlap(poly, zone)) add(item.id, { kind: 'blocks-opening', otherId: opening.id });
    }
  });

  return result;
}
