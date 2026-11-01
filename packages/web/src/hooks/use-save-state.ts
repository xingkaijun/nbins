import { useCallback, useEffect, useRef, useState } from "react";
import { createKeyedSaveController, createSaveController, type SaveState } from "../save-state";

/**
 * Save-button state for a component: `state` drives the label ("Saving…",
 * "Saved ✓") and the disabled flag, `run(action)` wraps the save call and
 * ignores repeat clicks while it is in flight.
 */
export function useSaveState(): { state: SaveState; saving: boolean; run: <T>(action: () => Promise<T>) => Promise<T | undefined> } {
  const [state, setState] = useState<SaveState>("idle");
  const controllerRef = useRef<ReturnType<typeof createSaveController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createSaveController(setState);
  }
  useEffect(() => () => controllerRef.current?.dispose(), []);
  const controller = controllerRef.current;
  const run = useCallback(<T,>(action: () => Promise<T>) => controller.run(action), [controller]);
  return { state, saving: state === "saving", run };
}

/**
 * Per-row save-button state (one button per list item). `stateOf(id)` gives the
 * row's state, `run(id, action)` saves it; a row already saving ignores clicks.
 */
export function useKeyedSaveState(): {
  stateOf: (key: string) => SaveState;
  isSaving: (key: string) => boolean;
  run: <T>(key: string, action: () => Promise<T>) => Promise<T | undefined>;
} {
  const [states, setStates] = useState<ReadonlyMap<string, SaveState>>(() => new Map());
  const controllerRef = useRef<ReturnType<typeof createKeyedSaveController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createKeyedSaveController(setStates);
  }
  useEffect(() => () => controllerRef.current?.dispose(), []);
  const controller = controllerRef.current;
  const stateOf = useCallback((key: string) => states.get(key) ?? "idle", [states]);
  const isSaving = useCallback((key: string) => states.get(key) === "saving", [states]);
  const run = useCallback(<T,>(key: string, action: () => Promise<T>) => controller.run(key, action), [controller]);
  return { stateOf, isSaving, run };
}
