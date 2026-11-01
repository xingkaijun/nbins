import { useEffect, useRef, useState } from "react";
import { createDebouncer } from "../debounce";

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 * When `immediate(value)` is true the new value is taken at once
 * (e.g. clearing the search box should not wait).
 */
export function useDebouncedValue<T>(value: T, delayMs: number, immediate?: (value: T) => boolean): T {
  const [debounced, setDebounced] = useState(value);
  const debouncerRef = useRef(createDebouncer(delayMs));

  useEffect(() => {
    const debouncer = debouncerRef.current;
    if (immediate?.(value)) {
      debouncer.cancel();
      setDebounced(value);
      return;
    }
    debouncer.schedule(() => setDebounced(value));
    return () => debouncer.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  return debounced;
}
