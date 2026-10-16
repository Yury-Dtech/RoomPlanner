import { describe, expect, test } from 'vitest';
import catalog from '../src/data/catalog.json';
import sample from '../src/data/project.json';
import { isColor, validateCatalog, validateProject } from '../src/data/validate';

const clone = () => structuredClone(sample) as any;

/** Asserts that validation fails with an error at `path` (and, optionally, a message matching `msg`). */
function expectError(p: unknown, path: string, msg?: RegExp): void {
  const r = validateProject(p);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  const found = r.errors.filter((e) => e.path === path);
  expect(found.length, `no error at "${path}", got: ${JSON.stringify(r.errors)}`).toBeGreaterThan(0);
  if (msg) expect(found.some((e) => msg.test(e.message)), JSON.stringify(found)).toBe(true);
}

describe('validateProject', () => {
  test('accepts bundled project and catalog', () => {
    expect(validateProject(sample).ok).toBe(true);
    expect(validateCatalog(catalog).ok).toBe(true);
  });

  test('returns the input object itself and keeps extra fields', () => {
    const p = clone();
    p.extra = { note: 'hand-written' };
    p.furniture[0].tag = 'keep me';
    const r = validateProject(p);
    expect(r.ok && r.value).toBe(p);
    expect(r.ok && (r.value as any).furniture[0].tag).toBe('keep me');
  });

  test('rejects non-object root', () => {
    for (const bad of ['nope', null, 42, [], undefined]) {
      const r = validateProject(bad);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.errors[0].path).toBe('');
    }
  });

  test('rejects unsupported version', () => {
    const p = clone();
    p.version = 2;
    expectError(p, 'version', /Неподдерживаемая версия проекта: 2/);
  });

  test('reports exact path for bad size', () => {
    const p = clone();
    p.furniture[0].size.w = -1;
    expectError(p, 'furniture[0].size.w');
  });

  test('reports missing sections and wrong types', () => {
    const p = clone();
    delete p.room;
    p.openings = 'none';
    expectError(p, 'room');
    expectError(p, 'openings');
  });

  test('rejects invalid wall and type enums', () => {
    const p = clone();
    p.openings[0].wall = 'up';
    p.openings[1].type = 'gate';
    p.sockets[0].wall = 'ceiling';
    expectError(p, 'openings[0].wall');
    expectError(p, 'openings[1].type');
    expectError(p, 'sockets[0].wall');
  });

  test('rejects non-finite and non-positive room sizes', () => {
    const p = clone();
    p.room.width = 0;
    p.room.length = Infinity;
    p.room.height = null;
    p.room.wallThickness = -5;
    for (const f of ['width', 'length', 'height', 'wallThickness']) expectError(p, `room.${f}`);
  });

  test('rejects opening beyond wall', () => {
    const p = clone();
    p.openings[1].offset = 3000; // north: 3000 + 1500 > 4200
    expectError(p, 'openings[1]', /выходит за пределы стены/);
  });

  test('rejects opening taller than the room', () => {
    const p = clone();
    p.openings[1].sill = 1500; // 1500 + 1400 > 2700
    expectError(p, 'openings[1]', /выходит за пределы высоты/);
  });

  test('rejects overlapping openings, reporting the later one', () => {
    const p = clone();
    p.openings.push({ id: 'window-2', type: 'window', wall: 'north', offset: 2000, width: 800, height: 1000, sill: 900 });
    expectError(p, 'openings[2]', /пересекается/);
    const r = validateProject(p);
    expect(!r.ok && r.errors.some((e) => e.path === 'openings[1]' && /пересекается/.test(e.message))).toBe(false);
  });

  test('allows touching openings on one wall and overlapping ranges on different walls', () => {
    const p = clone();
    // window-1 occupies 1200..2700 on the north wall
    p.openings.push({ id: 'window-2', type: 'window', wall: 'north', offset: 2700, width: 800, height: 1000, sill: 900 });
    // door-1 occupies 800..1700 on the south wall: touching its end is fine, and the north window's range is not shared
    p.openings.push({ id: 'window-3', type: 'window', wall: 'south', offset: 1700, width: 800, height: 1000, sill: 900 });
    p.openings.push({ id: 'window-4', type: 'window', wall: 'east', offset: 1200, width: 800, height: 1000, sill: 900 });
    expect(validateProject(p).ok).toBe(true);
  });

  test('rejects duplicate ids', () => {
    const p = clone();
    p.furniture[1].id = p.furniture[0].id;
    expectError(p, 'furniture[1].id', /уже используется/);
  });

  test('rejects duplicate ids in openings, sockets, estimate', () => {
    const p = clone();
    p.openings[1].id = p.openings[0].id;
    p.sockets.push({ ...p.sockets[0] });
    p.estimate.push({ ...p.estimate[0] });
    expectError(p, 'openings[1].id');
    expectError(p, 'sockets[1].id');
    expectError(p, 'estimate[1].id');
  });

  test('accepts #fff and rejects named colors', () => {
    const p = clone();
    p.furniture[0].color = '#fff';
    expect(validateProject(p).ok).toBe(true);
    p.furniture[0].color = 'red';
    expectError(p, 'furniture[0].color');
  });

  test('rejects bad material colors', () => {
    const p = clone();
    p.room.floorMaterial.color = '#zzz';
    p.room.wallMaterial = 'white';
    expectError(p, 'room.floorMaterial.color');
    expectError(p, 'room.wallMaterial');
  });

  test('collects several errors at once', () => {
    const p = clone();
    p.room.width = 0;
    p.furniture[0].size.h = 'tall';
    const r = validateProject(p);
    expect(!r.ok && r.errors.length).toBeGreaterThanOrEqual(2);
  });

  test('socket must lie on the wall and below the ceiling', () => {
    const p = clone();
    p.sockets[0].offset = 6000; // east wall length is 5000
    p.sockets[0].height = 3000;
    expectError(p, 'sockets[0].offset', /выходит за пределы стены/);
    expectError(p, 'sockets[0].height');
  });

  test('furniture position must be finite but may lie outside the room', () => {
    const p = clone();
    p.furniture[0].position.x = -500;
    expect(validateProject(p).ok).toBe(true);
    p.furniture[0].position.z = NaN;
    p.furniture[1].rotationY = 'left';
    expectError(p, 'furniture[0].position.z');
    expectError(p, 'furniture[1].rotationY');
  });

  test('estimate: quantity and unitPrice must be non-negative numbers, name a string', () => {
    const p = clone();
    p.estimate[0].quantity = -1;
    p.estimate[0].unitPrice = 'free';
    p.estimate[0].name = 5;
    expectError(p, 'estimate[0].quantity');
    expectError(p, 'estimate[0].unitPrice');
    expectError(p, 'estimate[0].name');
  });

  test('allows zero for sill, offset, quantity and unitPrice', () => {
    const p = clone();
    p.openings[0].offset = 0;
    p.openings[0].sill = 0;
    p.estimate[0].quantity = 0;
    p.estimate[0].unitPrice = 0;
    expect(validateProject(p).ok).toBe(true);
  });
});

describe('validateCatalog', () => {
  test('rejects non-array root', () => {
    const r = validateCatalog({});
    expect(!r.ok && r.errors[0].path).toBe('');
  });

  test('requires license', () => {
    const c = structuredClone(catalog) as any;
    c[0].license = '';
    const r = validateCatalog(c);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.some((e) => e.path === '[0].license')).toBe(true);
  });

  test('allows empty model but requires it to be a string', () => {
    const c = structuredClone(catalog) as any;
    c[0].model = '';
    expect(validateCatalog(c).ok).toBe(true);
    c[0].model = 5;
    const r = validateCatalog(c);
    expect(!r.ok && r.errors.some((e) => e.path === '[0].model')).toBe(true);
  });

  test('validates defaultSize and duplicate ids', () => {
    const c = structuredClone(catalog) as any;
    c[1].defaultSize.d = 0;
    c[2].id = c[0].id;
    const r = validateCatalog(c);
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual(expect.arrayContaining(['[1].defaultSize.d', '[2].id']));
  });
});

describe('isColor', () => {
  test('accepts #rgb and #rrggbb only', () => {
    expect(isColor('#fff')).toBe(true);
    expect(isColor('#A0b1C2')).toBe(true);
    for (const bad of ['red', '#ff', '#ffff', '#12345g', 'fff', '', 5, null, undefined]) {
      expect(isColor(bad)).toBe(false);
    }
  });
});
