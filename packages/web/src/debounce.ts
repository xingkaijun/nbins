/** Delay before a typed search keyword is sent to the server. */
export const KEYWORD_DEBOUNCE_MS = 300;

export interface TimerApi {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultTimers: TimerApi = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/**
 * Runs only the last scheduled callback, `delayMs` after the last call.
 * `flush()` runs a pending callback now; `cancel()` drops it.
 */
export function createDebouncer(delayMs: number, timers: TimerApi = defaultTimers) {
  let handle: unknown = null;
  let pending: (() => void) | null = null;

  return {
    schedule(callback: () => void) {
      if (handle !== null) timers.clearTimeout(handle);
      pending = callback;
      handle = timers.setTimeout(() => {
        handle = null;
        const run = pending;
        pending = null;
        run?.();
      }, delayMs);
    },
    flush() {
      if (handle !== null) timers.clearTimeout(handle);
      handle = null;
      const run = pending;
      pending = null;
      run?.();
    },
    cancel() {
      if (handle !== null) timers.clearTimeout(handle);
      handle = null;
      pending = null;
    },
    isPending() {
      return pending !== null;
    }
  };
}

/**
 * The value a debounced hook should expose for this render. A value that applies at once
 * (e.g. a cleared keyword) is returned in the same render as the change, so other filter
 * changes made together with it (Clear filters) never pair with the stale debounced value
 * and send a wasted request.
 */
export function resolveDebouncedValue<T>(value: T, debounced: T, immediate?: (value: T) => boolean): T {
  return immediate?.(value) ? value : debounced;
}
