import type { Project } from '../data/schema';

export type Listener = (project: Project, prev: Project) => void;

/**
 * Single source of truth for the project. State is immutable: every change is a new
 * `Project` object, so subscribers compare references (e.g. `p.room !== prev.room`)
 * to decide what to rebuild. Undo/redo can later wrap `set`.
 */
export class ProjectStore {
  private project: Project;
  private listeners = new Set<Listener>();

  constructor(initial: Project) {
    this.project = initial;
  }

  get(): Project {
    return this.project;
  }

  set(next: Project): void {
    if (next === this.project) return;
    const prev = this.project;
    this.project = next;
    // Iterate a copy so (un)subscribing inside a listener does not affect this round.
    for (const fn of [...this.listeners]) fn(next, prev);
  }

  /** Returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
