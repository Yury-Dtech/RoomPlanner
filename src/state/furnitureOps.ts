// Pure, immutable operations on the project's furniture. Untouched sub-objects keep their
// identity; an unknown id returns the original project object.

import type { CatalogEntry, FurnitureItem, Project, Size3 } from '../data/schema';
import { isColor } from '../data/validate';
import type { Vec2 } from '../utils/units';

export const DEFAULT_GRID_STEP = 50;
export const MAX_SIZE_MM = 20000;
const DEFAULT_COLOR = '#cccccc';

export type OpResult = { ok: true; project: Project } | { ok: false; error: string };

/** Rounds to the grid; `step <= 0` leaves the value unchanged. Never returns -0. */
export function snap(mm: number, step: number): number {
  if (!(step > 0)) return mm;
  return Math.round(mm / step) * step + 0;
}

/** Replaces one item via `update`; returns `p` itself when the id is unknown. */
function updateItem(p: Project, id: string, update: (item: FurnitureItem) => FurnitureItem): Project {
  const index = p.furniture.findIndex((f) => f.id === id);
  if (index < 0) return p;
  const furniture = p.furniture.slice();
  furniture[index] = update(p.furniture[index]);
  return { ...p, furniture };
}

export function moveItem(p: Project, id: string, pos: Vec2, step: number): Project {
  return updateItem(p, id, (item) => ({
    ...item,
    position: { x: snap(pos.x, step), z: snap(pos.z, step) },
  }));
}

export function rotateItem(p: Project, id: string, deltaDeg: number): Project {
  return updateItem(p, id, (item) => ({
    ...item,
    rotationY: (((item.rotationY + deltaDeg) % 360) + 360) % 360,
  }));
}

function sizeError(v: number): string | null {
  if (!Number.isFinite(v) || v <= 0) return 'Размер должен быть положительным числом';
  if (v > MAX_SIZE_MM) return `Размер не больше ${MAX_SIZE_MM} мм`;
  return null;
}

export function resizeItem(p: Project, id: string, size: Partial<Size3>): OpResult {
  for (const key of ['w', 'h', 'd'] as const) {
    const v = size[key];
    if (v === undefined) continue;
    const error = sizeError(v);
    if (error) return { ok: false, error };
  }
  return {
    ok: true,
    project: updateItem(p, id, (item) => ({ ...item, size: { ...item.size, ...size } })),
  };
}

export function recolorItem(p: Project, id: string, color: string): OpResult {
  if (!isColor(color)) return { ok: false, error: 'Цвет должен быть в формате #rrggbb' };
  return { ok: true, project: updateItem(p, id, (item) => ({ ...item, color })) };
}

/** Adds an item exactly at `at` (no snapping: callers decide). */
export function addItem(p: Project, entry: CatalogEntry, at: Vec2): { project: Project; id: string } {
  const taken = new Set(p.furniture.map((f) => f.id));
  let n = 1;
  while (taken.has(`${entry.id}-${n}`)) n++;
  const id = `${entry.id}-${n}`;
  const item: FurnitureItem = {
    id,
    catalogId: entry.id,
    position: { x: at.x, z: at.z },
    rotationY: 0,
    size: { ...entry.defaultSize },
    color: DEFAULT_COLOR,
  };
  return { project: { ...p, furniture: [...p.furniture, item] }, id };
}

export function removeItem(p: Project, id: string): Project {
  if (!p.furniture.some((f) => f.id === id)) return p;
  return { ...p, furniture: p.furniture.filter((f) => f.id !== id) };
}
