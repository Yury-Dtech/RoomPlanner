import { afterEach, describe, expect, test, vi } from 'vitest';
import sample from '../src/data/project.json';
import type { Project } from '../src/data/schema';
import {
  STORAGE_KEY,
  exportFileName,
  getSafeStorage,
  loadInitialProject,
  parseProjectFile,
  saveProject,
  serializeProject,
  type KeyValueStorage,
} from '../src/utils/storage';

const project = sample as unknown as Project;

/** In-memory fake of localStorage. */
function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

/** Storage whose writes always fail with a quota error. */
function throwingStorage(initial: Record<string, string> = {}): KeyValueStorage {
  return {
    ...memoryStorage(initial),
    setItem: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('loadInitialProject', () => {
  test('empty storage gives fallback without warnings', () => {
    expect(loadInitialProject(memoryStorage(), project)).toEqual({ project, warnings: [] });
  });

  test('valid stored project wins over fallback', () => {
    const s = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ ...project, name: 'X' }) });
    const r = loadInitialProject(s, project);
    expect(r.project.name).toBe('X');
    expect(r.warnings).toEqual([]);
  });

  test('corrupt storage falls back and keeps backup', () => {
    const s = memoryStorage({ [STORAGE_KEY]: '{oops' });
    const r = loadInitialProject(s, project);
    expect(r.project).toBe(project);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain(STORAGE_KEY + ':corrupt');
    expect(s.getItem(STORAGE_KEY + ':corrupt')).toBe('{oops');
  });

  test('schema-invalid stored project also falls back with backup', () => {
    const raw = JSON.stringify({ ...project, version: 2 });
    const s = memoryStorage({ [STORAGE_KEY]: raw });
    const r = loadInitialProject(s, project);
    expect(r.project).toBe(project);
    expect(r.warnings).toHaveLength(1);
    expect(s.getItem(STORAGE_KEY + ':corrupt')).toBe(raw);
  });

  test('still falls back, and says the backup failed, when the backup cannot be written', () => {
    const s = throwingStorage({ [STORAGE_KEY]: '{oops' });
    const r = loadInitialProject(s, project);
    expect(r.project).toBe(project);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/не удалось/i);
    expect(s.getItem(STORAGE_KEY + ':corrupt')).toBeNull();
  });

  test('does not throw when reading storage throws', () => {
    const s: KeyValueStorage = {
      ...memoryStorage(),
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    const r = loadInitialProject(s, project);
    expect(r.project).toBe(project);
    expect(r.warnings).toHaveLength(1);
  });

  test('null storage works', () => {
    expect(loadInitialProject(null, project)).toEqual({ project, warnings: [] });
    expect(loadInitialProject(null, project).project).toBe(project);
  });
});

describe('saveProject', () => {
  test('writes a project that loads back', () => {
    const s = memoryStorage();
    expect(saveProject(s, project)).toEqual({ ok: true });
    expect(loadInitialProject(s, { ...project, name: 'other' }).project).toEqual(project);
  });

  test('save reports quota errors instead of throwing', () => {
    const r = saveProject(throwingStorage(), project);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/места/);
  });

  test('save reports other write errors instead of throwing', () => {
    const s: KeyValueStorage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('boom');
      },
    };
    const r = saveProject(s, project);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('boom');
  });

  test('save with unavailable storage reports an error', () => {
    expect(saveProject(null, project).ok).toBe(false);
  });
});

describe('getSafeStorage', () => {
  test('returns null when localStorage access throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      expect(getSafeStorage()).toBeNull();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  test('returns null when localStorage does not exist', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getSafeStorage()).toBeNull();
  });

  test('returns the storage when available', () => {
    const s = memoryStorage();
    vi.stubGlobal('localStorage', s);
    expect(getSafeStorage()).toBe(s);
  });
});

describe('import / export', () => {
  test('round trip serialize → parse', () => {
    const r = parseProjectFile(serializeProject(project));
    expect(r.ok && r.value).toEqual(project);
  });

  test('serialize is pretty JSON with trailing newline', () => {
    const text = serializeProject(project);
    expect(text).toBe(JSON.stringify(project, null, 2) + '\n');
  });

  test('import of invalid file does not replace project', () => {
    const r = parseProjectFile('not json');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0].path).toBe('');
    expect(!r.ok && r.errors[0].message).toMatch(/^Файл не является корректным JSON: /);
  });

  test('import of schema-invalid JSON reports validation errors', () => {
    const r = parseProjectFile(JSON.stringify({ ...project, version: 2 }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.length).toBeGreaterThan(0);
  });

  test('import tolerates a UTF-8 BOM', () => {
    expect(parseProjectFile('\uFEFF' + serializeProject(project)).ok).toBe(true);
  });

  test('export file name is safe', () => {
    expect(exportFileName({ ...project, name: 'Моя комната: v2/3' })).toBe('Моя комната- v2-3.json');
  });

  test('export file name replaces every forbidden character and control chars', () => {
    expect(exportFileName({ ...project, name: 'a\\b/c:d*e?f"g<h>i|j\u0001k\nl' })).toBe('a-b-c-d-e-f-g-h-i-j-k-l.json');
  });

  test('export file name is trimmed and falls back when empty', () => {
    expect(exportFileName({ ...project, name: '  Спальня  ' })).toBe('Спальня.json');
    expect(exportFileName({ ...project, name: '' })).toBe('room-project.json');
    expect(exportFileName({ ...project, name: '   ' })).toBe('room-project.json');
    expect(exportFileName({ ...project, name: '. .' })).toBe('room-project.json');
  });
});
