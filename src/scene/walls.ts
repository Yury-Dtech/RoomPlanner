import type { Room, WallSide } from '../data/schema';
import type { Vec2 } from '../utils/units';

/** Solid wall rectangle in wall-local coordinates: u along the wall, v up from the floor (mm). */
export interface WallRect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface WallHole {
  offset: number;
  width: number;
  sill: number;
  height: number;
}

export function wallLength(room: Room, wall: WallSide): number {
  return wall === 'north' || wall === 'south' ? room.width : room.length;
}

/**
 * Wall basis in plan coordinates. `origin` is the wall's left corner as seen from inside
 * the room, `dir` points along the wall (increasing offset), `inward` points into the room.
 */
export function wallFrame(room: Room, wall: WallSide): { origin: Vec2; dir: Vec2; inward: Vec2 } {
  switch (wall) {
    case 'north':
      return { origin: { x: 0, z: room.length }, dir: { x: 1, z: 0 }, inward: { x: 0, z: -1 } };
    case 'south':
      return { origin: { x: room.width, z: 0 }, dir: { x: -1, z: 0 }, inward: { x: 0, z: 1 } };
    case 'east':
      return { origin: { x: room.width, z: room.length }, dir: { x: 0, z: -1 }, inward: { x: -1, z: 0 } };
    case 'west':
      return { origin: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, inward: { x: 1, z: 0 } };
  }
}

export function wallPointToPlan(room: Room, wall: WallSide, u: number): Vec2 {
  const { origin, dir } = wallFrame(room, wall);
  return { x: origin.x + dir.x * u, z: origin.z + dir.z * u };
}

/**
 * Solid parts of a wall around its openings, ordered by u0 then v0, never degenerate.
 * Assumes the holes are valid (inside the wall, not overlapping) — guaranteed by validation.
 */
export function wallPanels(length: number, height: number, holes: WallHole[]): WallRect[] {
  const panels: WallRect[] = [];
  const add = (u0: number, u1: number, v0: number, v1: number): void => {
    if (u1 > u0 && v1 > v0) panels.push({ u0, u1, v0, v1 });
  };

  let cursor = 0;
  for (const hole of [...holes].sort((a, b) => a.offset - b.offset)) {
    const u0 = hole.offset;
    const u1 = hole.offset + hole.width;
    add(cursor, u0, 0, height);
    add(u0, u1, 0, hole.sill);
    add(u0, u1, hole.sill + hole.height, height);
    cursor = u1;
  }
  add(cursor, length, 0, height);
  return panels;
}
