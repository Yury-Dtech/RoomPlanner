// The only place where millimetres (JSON / plan) are converted to metres (Three.js).
// Plan: x grows east, z grows north, origin is the south-west corner.
// World: x = plan x, z = -plan z (north is -Z), y = height. Lengths are divided by 1000.

export type Vec2 = { x: number; z: number };

export function mmToM(mm: number): number {
  return mm / 1000;
}

export function mToMm(m: number): number {
  return m * 1000;
}

// `0 - v` instead of `-v` so that 0 stays +0 (toEqual / Object.is distinguish -0).
export function planToWorld(p: Vec2): Vec2 {
  return { x: mmToM(p.x), z: 0 - mmToM(p.z) };
}

export function worldToPlan(p: Vec2): Vec2 {
  return { x: mToMm(p.x), z: 0 - mToMm(p.z) };
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
