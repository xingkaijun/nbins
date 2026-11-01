import type { TimerApi } from "./debounce";

export type SaveState = "idle" | "saving" | "saved";

/** How long a save button shows "Saved ✓" before it returns to its label. */
export const SAVED_FLASH_MS = 1800;

const defaultTimers: TimerApi = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** Button text for a save state. */
export function saveButtonLabel(state: SaveState, idleLabel: string): string {
  if (state === "saving") return "Saving…";
  if (state === "saved") return "Saved ✓";
  return idleLabel;
}

/**
 * Save-button state machine: idle → saving → saved → idle (after
 * SAVED_FLASH_MS), or saving → idle on failure. `run()` ignores calls while a
 * save is in flight, so a double click submits once.
 */
export function createSaveController(
  onChange: (state: SaveState) => void,
  options: { savedMs?: number; timers?: TimerApi } = {}
) {
  const savedMs = options.savedMs ?? SAVED_FLASH_MS;
  const timers = options.timers ?? defaultTimers;
  let state: SaveState = "idle";
  let resetHandle: unknown = null;

  const set = (next: SaveState) => {
    state = next;
    onChange(next);
  };
  const clearReset = () => {
    if (resetHandle !== null) timers.clearTimeout(resetHandle);
    resetHandle = null;
  };

  return {
    get state() {
      return state;
    },
    /**
     * Runs `action` unless a save is already in flight. Resolves with the
     * action's value, or `undefined` when the call was ignored. Rejections are
     * passed on after the state returns to idle.
     */
    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
      if (state === "saving") return undefined;
      clearReset();
      set("saving");
      try {
        const value = await action();
        set("saved");
        resetHandle = timers.setTimeout(() => {
          resetHandle = null;
          set("idle");
        }, savedMs);
        return value;
      } catch (error) {
        set("idle");
        throw error;
      }
    },
    dispose() {
      clearReset();
    }
  };
}
