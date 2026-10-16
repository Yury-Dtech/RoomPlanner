import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAutosave, debounce } from '../src/utils/autosave';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  test('runs once, delay ms after the last call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d.call();
    vi.advanceTimersByTime(200);
    d.call();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('flush runs a pending call immediately and only once', () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d.call();
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('flush without a pending call does nothing', () => {
    const fn = vi.fn();
    debounce(fn, 300).flush();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('createAutosave', () => {
  test('saves after the delay', () => {
    const save = vi.fn((): { ok: true } => ({ ok: true }));
    const onError = vi.fn();
    const autosave = createAutosave(save, onError, 300);
    autosave.schedule();
    autosave.schedule();
    vi.advanceTimersByTime(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('reports an error once until a save succeeds again', () => {
    let result: { ok: true } | { ok: false; error: string } = { ok: false, error: 'full' };
    const onError = vi.fn();
    const autosave = createAutosave(() => result, onError, 300);

    autosave.schedule();
    vi.advanceTimersByTime(300);
    autosave.schedule();
    vi.advanceTimersByTime(300);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('full');

    result = { ok: true };
    autosave.schedule();
    vi.advanceTimersByTime(300);

    result = { ok: false, error: 'full again' };
    autosave.schedule();
    vi.advanceTimersByTime(300);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith('full again');
  });

  test('flush saves a pending change immediately', () => {
    const save = vi.fn((): { ok: true } => ({ ok: true }));
    const autosave = createAutosave(save, vi.fn(), 300);
    autosave.schedule();
    autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
