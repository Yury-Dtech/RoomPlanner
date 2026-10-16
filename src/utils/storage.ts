import type { Project } from '../data/schema';
import { validateProject, type ValidationResult } from '../data/validate';

export const STORAGE_KEY = 'room-planner:project:v1';
const CORRUPT_KEY = `${STORAGE_KEY}:corrupt`;
const DEFAULT_FILE_NAME = 'room-project';

/** The subset of `Storage` the app uses; lets tests inject an in-memory fake. */
export interface KeyValueStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** `localStorage`, or `null` when it is missing or access throws (e.g. blocked site data). */
export function getSafeStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Loads the saved project, falling back to `fallback`. Never throws.
 * Unreadable or invalid stored data is copied to `${STORAGE_KEY}:corrupt` before the fallback
 * is used, so the user's layout is never silently destroyed by the next autosave.
 */
export function loadInitialProject(
  storage: KeyValueStorage | null,
  fallback: Project,
): { project: Project; warnings: string[] } {
  if (!storage) return { project: fallback, warnings: [] };

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return {
      project: fallback,
      warnings: [`Не удалось прочитать сохранённый проект (${describeError(e)}). Загружен исходный проект.`],
    };
  }
  if (raw === null) return { project: fallback, warnings: [] };

  let problem: string;
  try {
    const result = validateProject(JSON.parse(raw));
    if (result.ok) return { project: result.value, warnings: [] };
    const first = result.errors[0];
    problem = first.path ? `${first.path}: ${first.message}` : first.message;
  } catch (e) {
    problem = `не является корректным JSON (${describeError(e)})`;
  }

  let backup: string;
  try {
    storage.setItem(CORRUPT_KEY, raw);
    backup = `Копия сохранена в ${CORRUPT_KEY}.`;
  } catch {
    backup = `Не удалось сохранить копию в ${CORRUPT_KEY}.`;
  }
  return {
    project: fallback,
    warnings: [`Сохранённый проект повреждён и не загружен (${problem}). Загружен исходный проект. ${backup}`],
  };
}

export function saveProject(
  storage: KeyValueStorage | null,
  p: Project,
): { ok: true } | { ok: false; error: string } {
  if (!storage) return { ok: false, error: 'Хранилище браузера недоступно: изменения не сохраняются.' };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
    return { ok: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      return { ok: false, error: 'Не хватает места в хранилище браузера: изменения не сохранены.' };
    }
    return { ok: false, error: `Не удалось сохранить проект: ${describeError(e)}` };
  }
}

/** Parses and validates the text of an imported project file. */
export function parseProjectFile(text: string): ValidationResult<Project> {
  let data: unknown;
  try {
    // Editors on Windows like to prepend a BOM, which JSON.parse rejects.
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `Файл не является корректным JSON: ${describeError(e)}` }] };
  }
  return validateProject(data);
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2) + '\n';
}

/** `<project name>.json` with characters that are invalid in Windows/macOS file names replaced by `-`. */
export function exportFileName(p: Project): string {
  const slug = p.name
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .trim()
    // Windows drops trailing dots/spaces; leading dots would make a hidden file.
    .replace(/^[.\s]+|[.\s]+$/g, '');
  return `${slug || DEFAULT_FILE_NAME}.json`;
}

/** Triggers a browser download of the project as a JSON file. DOM only, not unit-tested. */
export function downloadProject(p: Project): void {
  const url = URL.createObjectURL(new Blob([serializeProject(p)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(p);
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled; some browsers cancel the download if revoked synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
