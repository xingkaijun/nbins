/**
 * Shared cache for the project list.
 *
 * It lives in its own module so writers other than the project endpoints
 * (the SQL console's import/delete calls) can invalidate it without importing
 * `./projects` (which would be a cycle: projects -> client -> ... -> sql-console).
 * Read by the project context, the top bar and the dashboard.
 */
import { createRequestCache } from "../request-cache.ts";

export const projectsCache = createRequestCache({ ttlMs: 30_000 });

export function invalidateProjectsCache(): void {
  projectsCache.invalidate();
}

/**
 * Runs a mutation and drops the project cache once it succeeded. A failed
 * mutation leaves the cached list untouched.
 */
export async function invalidateProjectsCacheAfter<T>(mutation: () => Promise<T>): Promise<T> {
  const result = await mutation();
  invalidateProjectsCache();
  return result;
}
