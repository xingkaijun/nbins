import test from "node:test";
import assert from "node:assert/strict";

import {
  ALL,
  DEFAULT_PAGE_SIZE,
  clearDashboardFilters,
  defaultDashboardFilters,
  filterDashboardItems,
  hasActiveFilters,
  paginate,
  parseDashboardFilters,
  serializeDashboardFilters,
  updateDashboardFilters
} from "./dashboard-filters.ts";

const TODAY = "2026-10-31";

function parse(query) {
  return parseDashboardFilters(new URLSearchParams(query), TODAY);
}

test("empty query means today's queue with defaults", () => {
  assert.deepEqual(parse(""), defaultDashboardFilters(TODAY));
  assert.equal(serializeDashboardFilters(defaultDashboardFilters(TODAY), TODAY).toString(), "");
});

test("filters round-trip through the query string", () => {
  const filters = {
    mode: "pending",
    date: "2026-10-20",
    hull: "H2",
    discipline: "HULL",
    keyword: "fairing block",
    page: 3,
    pageSize: 25
  };
  const query = serializeDashboardFilters(filters, TODAY);
  assert.equal(query.get("mode"), "pending");
  assert.equal(query.get("disc"), "HULL");
  assert.equal(query.get("q"), "fairing block");
  assert.deepEqual(parse(query.toString()), filters);
});

test("an empty date (all dates) survives the round trip", () => {
  const filters = { ...defaultDashboardFilters(TODAY), date: "" };
  const query = serializeDashboardFilters(filters, TODAY);
  assert.equal(query.get("date"), "all");
  assert.equal(parse(query.toString()).date, "");
});

test("invalid values fall back to defaults", () => {
  const parsed = parse("mode=bogus&date=31/10/2026&page=-2&size=7&hull=%20%20");
  assert.equal(parsed.mode, "date");
  assert.equal(parsed.date, TODAY);
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(parsed.hull, ALL);
});

test("serializing keeps unrelated query keys", () => {
  const query = serializeDashboardFilters(
    { ...defaultDashboardFilters(TODAY), hull: "H1" },
    TODAY,
    new URLSearchParams("foo=bar&page=9")
  );
  assert.equal(query.get("foo"), "bar");
  assert.equal(query.get("page"), null);
  assert.equal(query.get("hull"), "H1");
});

test("changing a filter resets the page, changing the page does not", () => {
  const start = { ...defaultDashboardFilters(TODAY), page: 4 };
  assert.equal(updateDashboardFilters(start, { hull: "H1" }).page, 1);
  assert.equal(updateDashboardFilters(start, { page: 2 }).page, 2);
});

test("hasActiveFilters and clearDashboardFilters", () => {
  const base = defaultDashboardFilters(TODAY);
  assert.equal(hasActiveFilters(base, TODAY), false);
  const busy = { ...base, keyword: "x", hull: "H1", pageSize: 100, page: 2 };
  assert.equal(hasActiveFilters(busy, TODAY), true);
  const cleared = clearDashboardFilters(busy, TODAY);
  assert.equal(hasActiveFilters(cleared, TODAY), false);
  assert.equal(cleared.pageSize, 100, "page size is a preference, not a filter");
  assert.equal(cleared.page, 1);
});

const ITEMS = [
  { id: "a", workflowStatus: "pending", openComments: 0, plannedDate: TODAY, hullNumber: "H1", discipline: "HULL", itemName: "Block fairing", currentResult: null, yardQc: "Li" },
  { id: "b", workflowStatus: "open", openComments: 2, plannedDate: "2026-10-01", hullNumber: "H2", discipline: "PAINT", itemName: "Coating check", currentResult: "QCC", yardQc: null },
  { id: "c", workflowStatus: "pending", openComments: 1, plannedDate: "2026-10-02", hullNumber: "H1", discipline: "PAINT", itemName: "Ballast tank", currentResult: null, yardQc: null }
];

test("filterDashboardItems applies mode, hull, discipline and keyword", () => {
  const base = defaultDashboardFilters(TODAY);
  assert.deepEqual(filterDashboardItems(ITEMS, base).map((i) => i.id), ["a"]);
  assert.deepEqual(filterDashboardItems(ITEMS, { ...base, date: "" }).map((i) => i.id), ["a", "b", "c"]);
  assert.deepEqual(filterDashboardItems(ITEMS, { ...base, mode: "pending" }).map((i) => i.id), ["a", "c"]);
  assert.deepEqual(filterDashboardItems(ITEMS, { ...base, mode: "open-comments" }).map((i) => i.id), ["b", "c"]);
  assert.deepEqual(filterDashboardItems(ITEMS, { ...base, mode: "pending", discipline: "PAINT" }).map((i) => i.id), ["c"]);
  // In date mode a keyword searches across all dates.
  assert.deepEqual(filterDashboardItems(ITEMS, { ...base, keyword: "  QCC " }).map((i) => i.id), ["b"]);
  assert.deepEqual(filterDashboardItems(ITEMS, { ...base, keyword: "li" }).map((i) => i.id), ["a"]);
});

test("paginate slices and clamps the page", () => {
  const list = Array.from({ length: 120 }, (_, index) => index + 1);
  const second = paginate(list, 2, 50);
  assert.equal(second.items.length, 50);
  assert.equal(second.from, 51);
  assert.equal(second.to, 100);
  assert.equal(second.pageCount, 3);

  const beyond = paginate(list, 99, 50);
  assert.equal(beyond.page, 3);
  assert.deepEqual([beyond.from, beyond.to], [101, 120]);

  const empty = paginate([], 5, 25);
  assert.deepEqual([empty.page, empty.pageCount, empty.from, empty.to, empty.items.length], [1, 1, 0, 0, 0]);
});
