import { ApiError } from "../../api/client.ts";

export interface BatchExportOutcome<T> {
  items: T[];
  /** Selected ids the server no longer has (404); they are dropped from the selection. */
  missingIds: string[];
}

/**
 * Only a 404 means "this item is gone" and can be skipped. Permissions (403),
 * expired sessions (401), network and server errors must surface to the user.
 */
export function isMissingItemError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * Fetches every selected item for the batch ZIP. Ids answered with 404 are
 * collected in `missingIds` so the caller can prune them and tell the user;
 * every other failure is rethrown and aborts the export.
 */
export async function collectBatchExportItems<T>(
  ids: Iterable<string>,
  fetchOne: (id: string) => Promise<T | null | undefined>
): Promise<BatchExportOutcome<T>> {
  const items: T[] = [];
  const missingIds: string[] = [];

  for (const id of ids) {
    try {
      const item = await fetchOne(id);
      if (item) {
        items.push(item);
      }
    } catch (error) {
      if (!isMissingItemError(error)) {
        throw error;
      }
      missingIds.push(id);
    }
  }

  return { items, missingIds };
}

/**
 * Removes `ids` from the cross-page selection. Returns the same Set when
 * nothing changes, so React can bail out of a re-render.
 */
export function dropSelectedIds(selected: ReadonlySet<string>, ids: Iterable<string>): Set<string> {
  const toDrop = [...ids].filter((id) => selected.has(id));

  if (toDrop.length === 0) {
    return selected as Set<string>;
  }

  const next = new Set(selected);
  for (const id of toDrop) {
    next.delete(id);
  }
  return next;
}

/** User-facing note after a batch export skipped items that no longer exist. */
export function batchExportSkippedMessage(missingCount: number): string {
  return missingCount === 1
    ? "1 selected inspection no longer exists and was skipped. It was removed from the selection."
    : `${missingCount} selected inspections no longer exist and were skipped. They were removed from the selection.`;
}
