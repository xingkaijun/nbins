/**
 * Tiny request cache: concurrent calls for the same key share one in-flight
 * request, and a resolved value is reused for `ttlMs`. Failures are not cached.
 * Used for data many components ask for on the same page load (projects).
 */
export interface RequestCache {
  get<T>(key: string, loader: () => Promise<T>): Promise<T>;
  /** Drops every entry whose key starts with `prefix` (all entries when omitted). */
  invalidate(prefix?: string): void;
  size(): number;
}

interface Entry {
  promise: Promise<unknown>;
  settledAt: number | null;
}

export function createRequestCache(options: { ttlMs: number; now?: () => number }): RequestCache {
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, Entry>();

  return {
    get<T>(key: string, loader: () => Promise<T>): Promise<T> {
      const existing = entries.get(key);
      if (existing && (existing.settledAt === null || now() - existing.settledAt < options.ttlMs)) {
        return existing.promise as Promise<T>;
      }

      const entry: Entry = { promise: Promise.resolve(), settledAt: null };
      entry.promise = loader().then(
        (value) => {
          entry.settledAt = now();
          return value;
        },
        (error: unknown) => {
          if (entries.get(key) === entry) {
            entries.delete(key);
          }
          throw error;
        }
      );
      entries.set(key, entry);
      return entry.promise as Promise<T>;
    },
    invalidate(prefix?: string) {
      for (const key of [...entries.keys()]) {
        if (prefix === undefined || key.startsWith(prefix)) {
          entries.delete(key);
        }
      }
    },
    size() {
      return entries.size;
    }
  };
}
