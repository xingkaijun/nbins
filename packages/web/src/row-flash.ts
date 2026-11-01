import type { TimerApi } from "./debounce";

/** How long a row stays highlighted after another tab saved it. */
export const ROW_FLASH_MS = 1600;

const defaultTimers: TimerApi = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/**
 * Tracks which list rows are currently flashing. `trigger(id)` starts (or
 * restarts) the flash of one row; it ends by itself after `durationMs`.
 * `onChange` receives the new set of flashing ids every time it changes.
 */
export function createRowFlash(
  onChange: (ids: ReadonlySet<string>) => void,
  options: { durationMs?: number; timers?: TimerApi } = {}
) {
  const durationMs = options.durationMs ?? ROW_FLASH_MS;
  const timers = options.timers ?? defaultTimers;
  const handles = new Map<string, unknown>();

  const emit = () => onChange(new Set(handles.keys()));

  return {
    trigger(id: string) {
      const existing = handles.get(id);
      if (existing !== undefined) timers.clearTimeout(existing);
      handles.set(
        id,
        timers.setTimeout(() => {
          handles.delete(id);
          emit();
        }, durationMs)
      );
      emit();
    },
    isFlashing(id: string) {
      return handles.has(id);
    },
    dispose() {
      for (const handle of handles.values()) timers.clearTimeout(handle);
      handles.clear();
    }
  };
}

/**
 * Ids of rows on the current page that an update from another tab touched.
 * Rows that are not on the page (or not in the list at all) do not flash.
 */
export function rowsToFlash(pageIds: readonly string[], updatedIds: readonly string[]): string[] {
  const onPage = new Set(pageIds);
  return [...new Set(updatedIds)].filter((id) => onPage.has(id));
}
