import type { TimerApi } from "./debounce";

export type SaveState = "idle" | "saving" | "saved";

/** How long a save button shows "Saved ✓" before it returns to its label. */
export const SAVED_FLASH_MS = 1800;

const defaultTimers: TimerApi = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** Button text for a save state. */
export function saveButtonLabel(
  state: SaveState,
  idleLabel: string,
  labels: { saving?: string; saved?: string } = {}
): string {
  if (state === "saving") return labels.saving ?? "Saving…";
  if (state === "saved") return labels.saved ?? "Saved ✓";
  return idleLabel;
}

/**
 * Success toast after an inspection result was submitted: names the status the
 * item ends up in ("Saved · QC RECHECK"), so the user does not have to read it
 * off the page. `resultLabel` is the label of the submitted result
 * (INSPECTION_RESULT_LABELS); without one the toast just says "Saved".
 */
export function inspectionSavedMessage(resultLabel: string | null | undefined, options: { demo?: boolean } = {}): string {
  const label = resultLabel?.trim();
  const base = label ? `Saved · ${label}` : "Saved";
  return options.demo ? `${base} (demo mode, not sent to the server)` : base;
}

/** Error toast text for a failed save: "<action> failed: <reason>". */
export function saveErrorMessage(action: string, error: unknown): string {
  const reason =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : typeof error === "string" && error.trim()
        ? error.trim()
        : "Unknown error";
  return `${action} failed: ${reason}`;
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

/**
 * The same state machine per key, for lists where every row has its own save
 * button (FAT items, NCR reviews). A save in flight for one key ignores repeat
 * calls for that key only; other keys save independently.
 */
export function createKeyedSaveController(
  onChange: (states: ReadonlyMap<string, SaveState>) => void,
  options: { savedMs?: number; timers?: TimerApi } = {}
) {
  const savedMs = options.savedMs ?? SAVED_FLASH_MS;
  const timers = options.timers ?? defaultTimers;
  const states = new Map<string, SaveState>();
  const resetHandles = new Map<string, unknown>();

  const emit = () => onChange(new Map(states));
  const set = (key: string, next: SaveState) => {
    if (next === "idle") states.delete(key);
    else states.set(key, next);
    emit();
  };
  const clearReset = (key: string) => {
    const handle = resetHandles.get(key);
    if (handle !== undefined) timers.clearTimeout(handle);
    resetHandles.delete(key);
  };

  return {
    stateOf(key: string): SaveState {
      return states.get(key) ?? "idle";
    },
    async run<T>(key: string, action: () => Promise<T>): Promise<T | undefined> {
      if (states.get(key) === "saving") return undefined;
      clearReset(key);
      set(key, "saving");
      try {
        const value = await action();
        set(key, "saved");
        resetHandles.set(
          key,
          timers.setTimeout(() => {
            resetHandles.delete(key);
            set(key, "idle");
          }, savedMs)
        );
        return value;
      } catch (error) {
        set(key, "idle");
        throw error;
      }
    },
    dispose() {
      for (const handle of resetHandles.values()) timers.clearTimeout(handle);
      resetHandles.clear();
    }
  };
}
