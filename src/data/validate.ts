import { wallLength } from '../scene/walls';
import type { CatalogEntry, Project, Room, WallSide } from './schema';

export interface ValidationError {
  /** Path to the offending field, e.g. `furniture[0].size.w`. The root is `''`. */
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

type Obj = Record<string, unknown>;
type Errors = ValidationError[];

const WALLS: readonly WallSide[] = ['north', 'south', 'east', 'west'];
const OPENING_TYPES = ['door', 'window'] as const;
const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isColor(s: unknown): s is string {
  return typeof s === 'string' && COLOR_RE.test(s);
}

// ---------- helpers ----------

const child = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);
const at = (path: string, index: number): string => `${path}[${index}]`;

function show(v: unknown): string {
  if (typeof v === 'number') return String(v);
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(errors: Errors, path: string, message: string): void {
  errors.push({ path, message });
}

/** Returns the object at `path`, or reports an error and returns undefined. */
function obj(errors: Errors, path: string, v: unknown): Obj | undefined {
  if (v === undefined) fail(errors, path, 'Обязательное поле отсутствует');
  else if (!isObj(v)) fail(errors, path, `Ожидается объект, получено ${show(v)}`);
  else return v;
  return undefined;
}

/** Returns the array at `path`, or reports an error and returns undefined. */
function arr(errors: Errors, path: string, v: unknown): unknown[] | undefined {
  if (v === undefined) fail(errors, path, 'Обязательное поле отсутствует');
  else if (!Array.isArray(v)) fail(errors, path, `Ожидается список, получено ${show(v)}`);
  else return v;
  return undefined;
}

/** Finite number with optional bounds. Returns the number only if it is valid. */
function num(
  errors: Errors,
  path: string,
  v: unknown,
  opts: { min?: number; exclusiveMin?: number } = {},
): number | undefined {
  if (v === undefined) {
    fail(errors, path, 'Обязательное поле отсутствует');
  } else if (typeof v !== 'number' || !Number.isFinite(v)) {
    fail(errors, path, `Ожидается конечное число, получено ${show(v)}`);
  } else if (opts.exclusiveMin !== undefined && v <= opts.exclusiveMin) {
    fail(errors, path, `Значение должно быть больше ${opts.exclusiveMin}, получено ${v}`);
  } else if (opts.min !== undefined && v < opts.min) {
    fail(errors, path, `Значение не может быть меньше ${opts.min}, получено ${v}`);
  } else {
    return v;
  }
  return undefined;
}

const positive = { exclusiveMin: 0 };
const nonNegative = { min: 0 };

function str(errors: Errors, path: string, v: unknown, opts: { nonEmpty?: boolean } = {}): string | undefined {
  if (v === undefined) fail(errors, path, 'Обязательное поле отсутствует');
  else if (typeof v !== 'string') fail(errors, path, `Ожидается строка, получено ${show(v)}`);
  else if (opts.nonEmpty && v.trim() === '') fail(errors, path, 'Строка не может быть пустой');
  else return v;
  return undefined;
}

function oneOf<T extends string>(errors: Errors, path: string, v: unknown, allowed: readonly T[]): T | undefined {
  if (v === undefined) fail(errors, path, 'Обязательное поле отсутствует');
  else if (!allowed.includes(v as T)) {
    fail(errors, path, `Недопустимое значение ${show(v)}, ожидается одно из: ${allowed.join(', ')}`);
  } else return v as T;
  return undefined;
}

function color(errors: Errors, path: string, v: unknown): void {
  if (v === undefined) fail(errors, path, 'Обязательное поле отсутствует');
  else if (!isColor(v)) fail(errors, path, `Ожидается цвет вида #rgb или #rrggbb, получено ${show(v)}`);
}

function size3(errors: Errors, path: string, v: unknown): void {
  const o = obj(errors, path, v);
  if (!o) return;
  for (const k of ['w', 'h', 'd']) num(errors, child(path, k), o[k], positive);
}

/** Validates every element of a list; reports duplicate `id`s on the later element. */
function eachWithUniqueIds(
  errors: Errors,
  path: string,
  v: unknown,
  check: (o: Obj, itemPath: string, index: number) => void,
): void {
  const list = arr(errors, path, v);
  if (!list) return;
  const seen = new Map<string, number>();
  list.forEach((item, i) => {
    const itemPath = at(path, i);
    const o = obj(errors, itemPath, item);
    if (!o) return;
    const id = str(errors, child(itemPath, 'id'), o.id, { nonEmpty: true });
    if (id !== undefined) {
      const first = seen.get(id);
      if (first !== undefined) {
        fail(errors, child(itemPath, 'id'), `Идентификатор "${id}" уже используется (${at(path, first)})`);
      } else {
        seen.set(id, i);
      }
    }
    check(o, itemPath, i);
  });
}

// ---------- project ----------

/** Returns the room only if the dimensions needed for wall checks are usable. */
function usableRoom(o: Obj | undefined): Room | undefined {
  if (!o) return undefined;
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  return ok(o.width) && ok(o.length) && ok(o.height) ? (o as unknown as Room) : undefined;
}

function validateRoom(errors: Errors, path: string, v: unknown): Obj | undefined {
  const o = obj(errors, path, v);
  if (!o) return undefined;
  for (const k of ['width', 'length', 'height', 'wallThickness']) num(errors, child(path, k), o[k], positive);
  for (const k of ['floorMaterial', 'wallMaterial']) {
    const m = obj(errors, child(path, k), o[k]);
    if (m) color(errors, child(child(path, k), 'color'), m.color);
  }
  return o;
}

function validateOpenings(errors: Errors, room: Room | undefined, v: unknown): void {
  // Valid [start, end) spans of earlier openings, per wall, for overlap detection.
  const spans = new Map<WallSide, { index: number; id: string; start: number; end: number }[]>();

  eachWithUniqueIds(errors, 'openings', v, (o, p, index) => {
    oneOf(errors, child(p, 'type'), o.type, OPENING_TYPES);
    const wall = oneOf(errors, child(p, 'wall'), o.wall, WALLS);
    const offset = num(errors, child(p, 'offset'), o.offset, nonNegative);
    const width = num(errors, child(p, 'width'), o.width, positive);
    const height = num(errors, child(p, 'height'), o.height, positive);
    const sill = num(errors, child(p, 'sill'), o.sill, nonNegative);

    if (room && wall && offset !== undefined && width !== undefined) {
      const len = wallLength(room, wall);
      if (offset + width > len) {
        fail(
          errors,
          p,
          `Проём выходит за пределы стены "${wall}": offset ${offset} + width ${width} = ${offset + width} > длины стены ${len}`,
        );
      }
    }
    if (room && height !== undefined && sill !== undefined && sill + height > room.height) {
      fail(
        errors,
        p,
        `Проём выходит за пределы высоты комнаты: sill ${sill} + height ${height} = ${sill + height} > ${room.height}`,
      );
    }

    if (wall && offset !== undefined && width !== undefined) {
      const list = spans.get(wall) ?? [];
      const start = offset;
      const end = offset + width;
      const other = list.find((s) => start < s.end && s.start < end);
      if (other) {
        fail(
          errors,
          p,
          `Проём пересекается с проёмом "${other.id}" (${at('openings', other.index)}) на стене "${wall}"`,
        );
      }
      list.push({ index, id: typeof o.id === 'string' ? o.id : String(index), start, end });
      spans.set(wall, list);
    }
  });
}

function validateSockets(errors: Errors, room: Room | undefined, v: unknown): void {
  eachWithUniqueIds(errors, 'sockets', v, (o, p) => {
    const wall = oneOf(errors, child(p, 'wall'), o.wall, WALLS);
    const offset = num(errors, child(p, 'offset'), o.offset, nonNegative);
    const height = num(errors, child(p, 'height'), o.height, nonNegative);
    if (room && wall && offset !== undefined) {
      const len = wallLength(room, wall);
      if (offset > len) {
        fail(errors, child(p, 'offset'), `Розетка выходит за пределы стены "${wall}": offset ${offset} > длины стены ${len}`);
      }
    }
    if (room && height !== undefined && height > room.height) {
      fail(errors, child(p, 'height'), `Розетка выше комнаты: height ${height} > ${room.height}`);
    }
  });
}

function validateFurniture(errors: Errors, v: unknown): void {
  eachWithUniqueIds(errors, 'furniture', v, (o, p) => {
    str(errors, child(p, 'catalogId'), o.catalogId, { nonEmpty: true });
    const pos = obj(errors, child(p, 'position'), o.position);
    if (pos) for (const k of ['x', 'z']) num(errors, child(child(p, 'position'), k), pos[k]);
    num(errors, child(p, 'rotationY'), o.rotationY);
    size3(errors, child(p, 'size'), o.size);
    color(errors, child(p, 'color'), o.color);
  });
}

function validateEstimate(errors: Errors, v: unknown): void {
  eachWithUniqueIds(errors, 'estimate', v, (o, p) => {
    for (const k of ['category', 'name', 'unit', 'note']) str(errors, child(p, k), o[k]);
    num(errors, child(p, 'quantity'), o.quantity, nonNegative);
    num(errors, child(p, 'unitPrice'), o.unitPrice, nonNegative);
  });
}

/**
 * Validates a project document. Collects all errors (not just the first). On success returns
 * the very same object, typed - extra fields are preserved.
 */
export function validateProject(input: unknown): ValidationResult<Project> {
  const errors: Errors = [];
  if (!isObj(input)) {
    fail(errors, '', `Проект должен быть объектом, получено ${show(input)}`);
    return { ok: false, errors };
  }

  if (input.version !== 1) {
    fail(
      errors,
      'version',
      `Неподдерживаемая версия проекта: ${input.version === undefined ? 'не указана' : show(input.version)}`,
    );
  }
  str(errors, 'name', input.name);
  const room = usableRoom(validateRoom(errors, 'room', input.room));
  validateOpenings(errors, room, input.openings);
  validateSockets(errors, room, input.sockets);
  validateFurniture(errors, input.furniture);
  validateEstimate(errors, input.estimate);

  return errors.length === 0 ? { ok: true, value: input as unknown as Project } : { ok: false, errors };
}

// ---------- catalog ----------

export function validateCatalog(input: unknown): ValidationResult<CatalogEntry[]> {
  const errors: Errors = [];
  if (!Array.isArray(input)) {
    fail(errors, '', `Каталог должен быть списком, получено ${show(input)}`);
    return { ok: false, errors };
  }

  const seen = new Map<string, number>();
  input.forEach((item, i) => {
    const p = at('', i);
    const o = obj(errors, p, item);
    if (!o) return;
    const id = str(errors, child(p, 'id'), o.id, { nonEmpty: true });
    if (id !== undefined) {
      const first = seen.get(id);
      if (first !== undefined) fail(errors, child(p, 'id'), `Идентификатор "${id}" уже используется (${at('', first)})`);
      else seen.set(id, i);
    }
    str(errors, child(p, 'name'), o.name, { nonEmpty: true });
    str(errors, child(p, 'category'), o.category);
    str(errors, child(p, 'model'), o.model);
    size3(errors, child(p, 'defaultSize'), o.defaultSize);
    str(errors, child(p, 'source'), o.source);
    if (o.license === undefined || (typeof o.license === 'string' && o.license.trim() === '')) {
      fail(errors, child(p, 'license'), 'Лицензия обязательна и не может быть пустой');
    } else {
      str(errors, child(p, 'license'), o.license);
    }
  });

  return errors.length === 0 ? { ok: true, value: input as CatalogEntry[] } : { ok: false, errors };
}
