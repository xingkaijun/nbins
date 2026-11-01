import { useEffect, useRef, useState } from "react";
import { createSaveController, type SaveState } from "../save-state";

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
  return { state, saving: state === "saving", run: (action) => controller.run(action) };
}
