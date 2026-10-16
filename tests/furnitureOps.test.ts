import { describe, expect, test } from 'vitest';
import sample from '../src/data/project.json';
import catalog from '../src/data/catalog.json';
import type { CatalogEntry, FurnitureItem, Project } from '../src/data/schema';
import {
  DEFAULT_GRID_STEP,
  addItem,
  moveItem,
  recolorItem,
  removeItem,
  resizeItem,
  rotateItem,
  snap,
} from '../src/state/furnitureOps';

const base = sample as unknown as Project;
const entries = catalog as unknown as CatalogEntry[];
const wardrobeEntry = entries.find((e) => e.id === 'wardrobe-basic')!;

const find = (p: Project, id: string): FurnitureItem => p.furniture.find((f) => f.id === id)!;

describe('snap', () => {
  test('rounds to grid', () => {
    expect(snap(1234, 50)).toBe(1250);
    expect(snap(1224, 50)).toBe(1200);
    expect(snap(-26, 50)).toBe(-50);
    expect(snap(1234, 0)).toBe(1234);
    expect(snap(1234, -5)).toBe(1234);
  });

  test('never returns negative zero', () => {
    expect(Object.is(snap(-10, 50), 0)).toBe(true);
  });

  test('default grid step is 50 mm', () => {
    expect(DEFAULT_GRID_STEP).toBe(50);
  });
});

describe('moveItem', () => {
  test('snaps and is immutable', () => {
    const next = moveItem(base, 'desk-1', { x: 1012, z: 2988 }, 50);
    expect(find(next, 'desk-1').position).toEqual({ x: 1000, z: 3000 });
    expect(find(base, 'desk-1').position).toEqual({ x: 1950, z: 4700 });
    expect(next.room).toBe(base.room);
  });

  test('keeps untouched items by reference', () => {
    const next = moveItem(base, 'desk-1', { x: 1000, z: 3000 }, 50);
    expect(find(next, 'bed-1')).toBe(find(base, 'bed-1'));
    expect(find(next, 'wardrobe-1')).toBe(find(base, 'wardrobe-1'));
    expect(next.furniture.map((f) => f.id)).toEqual(base.furniture.map((f) => f.id));
  });

  test('step 0 keeps the raw position', () => {
    const next = moveItem(base, 'desk-1', { x: 1012, z: 2988 }, 0);
    expect(find(next, 'desk-1').position).toEqual({ x: 1012, z: 2988 });
  });

  test('non-finite coordinates return the same project', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(moveItem(base, 'desk-1', { x: bad, z: 100 }, 50)).toBe(base);
      expect(moveItem(base, 'desk-1', { x: 100, z: bad }, 50)).toBe(base);
    }
  });

  test('unknown id returns the same project', () => {
    expect(moveItem(base, 'nope', { x: 0, z: 0 }, 50)).toBe(base);
  });

  test('a move that snaps back to the current position returns the same project', () => {
    // desk-1 is at (1950, 4700): sub-step pointer jitter while dragging changes nothing.
    expect(moveItem(base, 'desk-1', { x: 1962, z: 4689 }, 50)).toBe(base);
    expect(moveItem(base, 'desk-1', { x: 1950, z: 4700 }, 0)).toBe(base);
  });
});

describe('rotateItem', () => {
  test('normalizes angle into [0, 360)', () => {
    expect(find(rotateItem(base, 'bed-1', 270), 'bed-1').rotationY).toBe(0);
    expect(find(rotateItem(base, 'desk-1', -90), 'desk-1').rotationY).toBe(270);
    expect(find(rotateItem(base, 'bed-1', 90), 'bed-1').rotationY).toBe(180);
    expect(find(rotateItem(base, 'desk-1', -360), 'desk-1').rotationY).toBe(0);
  });

  test('is immutable and keeps other items', () => {
    const next = rotateItem(base, 'desk-1', 90);
    expect(find(base, 'desk-1').rotationY).toBe(0);
    expect(next.room).toBe(base.room);
    expect(find(next, 'bed-1')).toBe(find(base, 'bed-1'));
  });

  test('non-finite delta returns the same project', () => {
    for (const bad of [NaN, Infinity, -Infinity]) expect(rotateItem(base, 'desk-1', bad)).toBe(base);
  });

  test('unknown id returns the same project', () => {
    expect(rotateItem(base, 'nope', 90)).toBe(base);
  });
});

describe('resizeItem', () => {
  test('rejects non-positive and non-finite', () => {
    for (const w of [0, -10, NaN, Infinity]) {
      const r = resizeItem(base, 'desk-1', { w });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('Размер должен быть положительным числом');
    }
    expect(resizeItem(base, 'desk-1', { h: 800 }).ok).toBe(true);
  });

  test('rejects sizes above 20000 mm, accepts the limit', () => {
    const r = resizeItem(base, 'desk-1', { d: 20001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Размер не больше 20000 мм');
    expect(resizeItem(base, 'desk-1', { d: 20000 }).ok).toBe(true);
  });

  test('applies only the given dimensions and is immutable', () => {
    const r = resizeItem(base, 'desk-1', { h: 800 });
    if (!r.ok) throw new Error('expected ok');
    expect(find(r.project, 'desk-1').size).toEqual({ w: 1200, h: 800, d: 600 });
    expect(find(base, 'desk-1').size).toEqual({ w: 1200, h: 750, d: 600 });
    expect(r.project.room).toBe(base.room);
    expect(find(r.project, 'bed-1')).toBe(find(base, 'bed-1'));
  });

  test('explicit undefined keys are ignored and never overwrite the size', () => {
    const r = resizeItem(base, 'desk-1', { w: undefined, h: 800 });
    if (!r.ok) throw new Error('expected ok');
    expect(find(r.project, 'desk-1').size).toEqual({ w: 1200, h: 800, d: 600 });
  });

  test('invalid dimension anywhere rejects the whole change', () => {
    expect(resizeItem(base, 'desk-1', { w: 1000, h: -1 }).ok).toBe(false);
  });

  test('unknown id returns ok with the same project', () => {
    const r = resizeItem(base, 'nope', { w: 100 });
    expect(r.ok && r.project).toBe(base);
  });
});

describe('recolorItem', () => {
  test('rejects invalid color', () => {
    for (const c of ['#zzz', '', 'red', '#12345', '#1234567']) {
      const r = recolorItem(base, 'desk-1', c);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('Цвет должен быть в формате #rrggbb');
    }
  });

  test('applies a valid color immutably', () => {
    const r = recolorItem(base, 'desk-1', '#112233');
    if (!r.ok) throw new Error('expected ok');
    expect(find(r.project, 'desk-1').color).toBe('#112233');
    expect(find(base, 'desk-1').color).toBe('#8b6b4a');
    expect(find(r.project, 'bed-1')).toBe(find(base, 'bed-1'));
  });

  test('unknown id returns ok with the same project', () => {
    const r = recolorItem(base, 'nope', '#112233');
    expect(r.ok && r.project).toBe(base);
  });
});

describe('addItem', () => {
  test('generates unique ids', () => {
    const occupied: Project = {
      ...base,
      furniture: [...base.furniture, { ...find(base, 'wardrobe-1'), id: 'wardrobe-basic-1' }],
    };
    const { project, id } = addItem(occupied, wardrobeEntry, { x: 100, z: 200 });
    expect(id).toBe('wardrobe-basic-2');
    expect(project.furniture.filter((f) => f.id === id)).toHaveLength(1);
  });

  test('first free n is used, gaps are filled', () => {
    const withTwo: Project = {
      ...base,
      furniture: [
        { ...find(base, 'wardrobe-1'), id: 'wardrobe-basic-2' },
        { ...find(base, 'wardrobe-1'), id: 'wardrobe-basic-3' },
      ],
    };
    expect(addItem(withTwo, wardrobeEntry, { x: 0, z: 0 }).id).toBe('wardrobe-basic-1');
  });

  test('uses catalog defaults, keeps position unsnapped, is immutable', () => {
    const at = { x: 1013, z: 777 };
    const { project, id } = addItem(base, wardrobeEntry, at);
    const added = find(project, id);
    expect(added).toEqual({
      id,
      catalogId: 'wardrobe-basic',
      position: { x: 1013, z: 777 },
      rotationY: 0,
      size: wardrobeEntry.defaultSize,
      color: '#cccccc',
    });
    expect(added.size).not.toBe(wardrobeEntry.defaultSize);
    expect(project.furniture).toHaveLength(base.furniture.length + 1);
    expect(base.furniture).toHaveLength(3);
    expect(project.room).toBe(base.room);
    expect(find(project, 'desk-1')).toBe(find(base, 'desk-1'));
  });
});

describe('removeItem', () => {
  test('removes the item and keeps the rest by reference', () => {
    const next = removeItem(base, 'bed-1');
    expect(next.furniture.map((f) => f.id)).toEqual(['wardrobe-1', 'desk-1']);
    expect(find(next, 'desk-1')).toBe(find(base, 'desk-1'));
    expect(next.room).toBe(base.room);
    expect(base.furniture).toHaveLength(3);
  });

  test('unknown id returns the same project', () => {
    expect(removeItem(base, 'nope')).toBe(base);
  });
});
