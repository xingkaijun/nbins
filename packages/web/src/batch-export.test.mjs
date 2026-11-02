import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "./api/client.ts";
import {
  batchExportSkippedMessage,
  collectBatchExportItems,
  dropSelectedIds,
  isMissingItemError
} from "./pages/dashboard/batch-export.ts";

// ---- 404 detection ----

test("only a 404 ApiError counts as a deleted item", () => {
  assert.equal(isMissingItemError(new ApiError("Not found", 404)), true);
  assert.equal(isMissingItemError(new ApiError("Forbidden", 403)), false);
  assert.equal(isMissingItemError(new ApiError("Unauthorized", 401)), false);
  assert.equal(isMissingItemError(new ApiError("Server error", 500)), false);
  assert.equal(isMissingItemError(new Error("Failed to fetch")), false);
  assert.equal(isMissingItemError("404"), false);
  assert.equal(isMissingItemError(null), false);
});

// ---- batch export ----

const detail = (id) => ({ id, itemName: `Item ${id}` });

test("a deleted item is skipped and the rest of the selection is exported", async () => {
  const gone = new Set(["b"]);
  const outcome = await collectBatchExportItems(["a", "b", "c"], async (id) => {
    if (gone.has(id)) throw new ApiError("Inspection not found", 404);
    return detail(id);
  });

  assert.deepEqual(outcome.items.map((item) => item.id), ["a", "c"]);
  assert.deepEqual(outcome.missingIds, ["b"]);
});

test("several deleted items are all reported, in selection order", async () => {
  const outcome = await collectBatchExportItems(["x", "a", "y"], async (id) => {
    if (id === "x" || id === "y") throw new ApiError("Not found", 404);
    return detail(id);
  });

  assert.deepEqual(outcome.items.map((item) => item.id), ["a"]);
  assert.deepEqual(outcome.missingIds, ["x", "y"]);
});

test("a permission error aborts the export instead of being swallowed", async () => {
  const reached = [];
  await assert.rejects(
    () => collectBatchExportItems(["a", "b", "c"], async (id) => {
      reached.push(id);
      if (id === "b") throw new ApiError("Insufficient role", 403);
      return detail(id);
    }),
    (error) => error instanceof ApiError && error.status === 403
  );
  assert.deepEqual(reached, ["a", "b"], "must stop at the failing item, not continue");
});

test("network errors abort the export", async () => {
  await assert.rejects(
    () => collectBatchExportItems(["a"], async () => {
      throw new TypeError("Failed to fetch");
    }),
    TypeError
  );
});

test("an empty loader result is ignored, not exported as undefined", async () => {
  const outcome = await collectBatchExportItems(["a", "b"], async (id) => (id === "a" ? detail(id) : null));
  assert.deepEqual(outcome.items.map((item) => item.id), ["a"]);
  assert.deepEqual(outcome.missingIds, []);
});

// ---- cross-page selection ----

test("dropping deleted ids keeps selections made on other pages", () => {
  const selected = new Set(["page-1-a", "deleted", "page-2-b"]);
  const next = dropSelectedIds(selected, ["deleted"]);
  assert.deepEqual([...next], ["page-1-a", "page-2-b"]);
  assert.deepEqual([...selected], ["page-1-a", "deleted", "page-2-b"], "input is not mutated");
});

test("dropping ids that are no longer selected returns the same Set", () => {
  const selected = new Set(["a"]);
  assert.equal(dropSelectedIds(selected, ["gone"]), selected);
  assert.equal(dropSelectedIds(selected, []), selected);
});

// ---- user-facing note ----

test("the skipped note is pluralised by count", () => {
  assert.match(batchExportSkippedMessage(1), /^1 selected inspection no longer exists/);
  assert.match(batchExportSkippedMessage(3), /^3 selected inspections no longer exist/);
});
