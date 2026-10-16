import { describe, expect, test, vi } from 'vitest';
import sample from '../src/data/project.json';
import type { Project } from '../src/data/schema';
import { ProjectStore } from '../src/state/store';

const base = sample as unknown as Project;

describe('ProjectStore', () => {
  test('get returns the initial project', () => {
    expect(new ProjectStore(base).get()).toBe(base);
  });

  test('notifies with next and prev and supports unsubscribe', () => {
    const store = new ProjectStore(base);
    const fn = vi.fn();
    const unsubscribe = store.subscribe(fn);

    const next: Project = { ...base, name: 'Другая комната' };
    store.set(next);
    expect(store.get()).toBe(next);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(next, base);

    unsubscribe();
    store.set({ ...base, name: 'Ещё одна' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('set with the same object does not notify', () => {
    const store = new ProjectStore(base);
    const fn = vi.fn();
    store.subscribe(fn);
    store.set(store.get());
    expect(fn).not.toHaveBeenCalled();
  });

  test('subscribers can compare references to detect room changes', () => {
    const store = new ProjectStore(base);
    const roomChanged: boolean[] = [];
    store.subscribe((p, prev) => roomChanged.push(p.room !== prev.room));
    store.set({ ...base, furniture: [] });
    store.set({ ...base, furniture: [], room: { ...base.room, width: 5000 } });
    expect(roomChanged).toEqual([false, true]);
  });

  test('unsubscribing inside a callback does not skip other subscribers', () => {
    const store = new ProjectStore(base);
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(() => unsubscribeFirst());
    store.subscribe(second);
    store.set({ ...base, name: 'x' });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
