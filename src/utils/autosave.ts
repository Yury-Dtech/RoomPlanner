// DOM-free timing helpers for saving the project in the background.

export interface Debounced {
  /** (Re)starts the timer: `fn` runs `delayMs` after the last call. */
  call(): void;
  /** Runs a pending call now (e.g. before the page unloads); no-op when nothing is pending. */
  flush(): void;
}

export function debounce(fn: () => void, delayMs: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = (): void => {
    timer = null;
    fn();
  };
  return {
    call() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    flush() {
      if (timer === null) return;
      clearTimeout(timer);
      run();
    },
  };
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface Autosave {
  /** Call on every change; the save runs `delayMs` after the last one. */
  schedule(): void;
  flush(): void;
}

/**
 * Debounced saving. A failure is reported through `onError` once; further failures stay quiet
 * until a save succeeds again, so a full storage does not flood the user with messages.
 */
export function createAutosave(save: () => SaveResult, onError: (error: string) => void, delayMs: number): Autosave {
  let failing = false;
  const d = debounce(() => {
    const r = save();
    if (r.ok) {
      failing = false;
    } else if (!failing) {
      failing = true;
      onError(r.error);
    }
  }, delayMs);
  return { schedule: d.call, flush: d.flush };
}
