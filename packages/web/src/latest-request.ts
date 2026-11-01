/**
 * "Latest request wins": every `begin()` aborts the request started before it,
 * and `isStale()` tells a late response apart from the current one, so a slow
 * answer for old filters can never overwrite the list for new ones.
 * Kept free of imports so node tests can load it directly.
 */
export interface LatestRequestTicket {
  signal: AbortSignal;
  /** True once a newer request began or this one was aborted. */
  isStale(): boolean;
  abort(): void;
}

export function createLatestRequestGate() {
  let current: AbortController | null = null;

  return {
    begin(): LatestRequestTicket {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return {
        signal: controller.signal,
        isStale: () => controller !== current || controller.signal.aborted,
        abort: () => {
          controller.abort();
          if (current === controller) current = null;
        }
      };
    },
    /** Aborts the request in flight, if any. */
    abort() {
      current?.abort();
      current = null;
    }
  };
}
