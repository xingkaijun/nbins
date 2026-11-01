import { useCallback, useEffect, useRef, useState } from "react";
import { createRowFlash } from "../row-flash";

/** Set of row ids currently flashing, and `flash(id)` to start one. */
export function useRowFlash(): { flashing: ReadonlySet<string>; flash: (id: string) => void } {
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(() => new Set());
  const controllerRef = useRef<ReturnType<typeof createRowFlash> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createRowFlash(setFlashing);
  }
  useEffect(() => () => controllerRef.current?.dispose(), []);
  const flash = useCallback((id: string) => controllerRef.current?.trigger(id), []);
  return { flashing, flash };
}
