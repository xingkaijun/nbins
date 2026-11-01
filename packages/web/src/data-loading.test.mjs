import test from "node:test";
import assert from "node:assert/strict";

import { createRequestCache, projectsCacheKey } from "./request-cache.ts";
import { KEYWORD_DEBOUNCE_MS, createDebouncer } from "./debounce.ts";
import { createLatestRequestGate } from "./latest-request.ts";
import { buildInspectionListParams, inspectionListFilterKey, isAbortError } from "./inspection-list-query.ts";
import { createFakeTimers, deferred } from "./test-helpers/fake-timers.mjs";

// ---- /api/projects request dedupe cache ----

test("concurrent project requests share one fetch", async () => {
  const cache = createRequestCache({ ttlMs: 30_000, now: () => 0 });
  const response = deferred();
  let fetches = 0;
  const loader = () => {
    fetches += 1;
    return response.promise;
  };
  const key = projectsCacheKey("token-1", undefined);
  const a = cache.get(key, loader);
  const b = cache.get(key, loader);
  const c = cache.get(key, loader);
  response.resolve([{ id: "p1" }]);
  const results = await Promise.all([a, b, c]);
  assert.equal(fetches, 1);
  assert.ok(results.every((r) => r === results[0]));
});

test("a cached project list is reused inside the TTL and refetched after it", async () => {
  let now = 0;
  const cache = createRequestCache({ ttlMs: 30_000, now: () => now });
  let fetches = 0;
  const loader = async () => {
    fetches += 1;
    return fetches;
  };
  assert.equal(await cache.get("k", loader), 1);
  now = 29_999;
  assert.equal(await cache.get("k", loader), 1);
  now = 30_000;
  assert.equal(await cache.get("k", loader), 2);
});

test("a failed project request is not cached", async () => {
  const cache = createRequestCache({ ttlMs: 30_000, now: () => 0 });
  await assert.rejects(cache.get("k", () => Promise.reject(new Error("503"))), /503/);
  assert.equal(cache.size(), 0);
  assert.equal(await cache.get("k", async () => "ok"), "ok");
});

test("invalidate (project created or changed) forces a fresh request", async () => {
  const cache = createRequestCache({ ttlMs: 30_000, now: () => 0 });
  let fetches = 0;
  const loader = async () => ++fetches;
  await cache.get(projectsCacheKey("t", "active"), loader);
  await cache.get("other:x", loader);
  cache.invalidate("projects:");
  assert.equal(cache.size(), 1, "only project entries dropped");
  assert.equal(await cache.get(projectsCacheKey("t", "active"), loader), 3);
  cache.invalidate();
  assert.equal(cache.size(), 0);
});

test("project cache keys separate users and status filters", () => {
  assert.equal(projectsCacheKey("t1", undefined), "projects:t1:");
  assert.equal(projectsCacheKey(null, "active"), "projects::active");
  assert.notEqual(projectsCacheKey("t1"), projectsCacheKey("t2"));
  assert.notEqual(projectsCacheKey("t1"), projectsCacheKey("t1", "archived"));
});

// ---- keyword debounce ----

test("keyword search waits 300 ms after the last keystroke and sends only the last value", () => {
  assert.equal(KEYWORD_DEBOUNCE_MS, 300);
  const clock = createFakeTimers();
  const sent = [];
  const debouncer = createDebouncer(KEYWORD_DEBOUNCE_MS, clock.api);

  for (const keyword of ["b", "bl", "blo", "block"]) {
    debouncer.schedule(() => sent.push(keyword));
    clock.advance(100);
  }
  assert.deepEqual(sent, []);
  assert.equal(debouncer.isPending(), true);
  clock.advance(199);
  assert.deepEqual(sent, []);
  clock.advance(1);
  assert.deepEqual(sent, ["block"]);
  assert.equal(debouncer.isPending(), false);
});

test("debounce flush sends now, cancel drops the pending value", () => {
  const clock = createFakeTimers();
  const sent = [];
  const debouncer = createDebouncer(300, clock.api);
  debouncer.schedule(() => sent.push("enter"));
  debouncer.flush();
  assert.deepEqual(sent, ["enter"]);
  clock.advance(300);
  assert.deepEqual(sent, ["enter"], "flushed callback does not run twice");

  debouncer.schedule(() => sent.push("dropped"));
  debouncer.cancel();
  clock.advance(300);
  assert.deepEqual(sent, ["enter"]);
  assert.equal(clock.pending(), 0);
});

// ---- stale request abort ----

test("a new list request aborts the one in flight", () => {
  const gate = createLatestRequestGate();
  const first = gate.begin();
  assert.equal(first.signal.aborted, false);
  const second = gate.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isStale(), true);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isStale(), false);
});

test("a late answer for old filters is dropped, the newest one is applied", async () => {
  const gate = createLatestRequestGate();
  const applied = [];
  const slow = deferred();
  const fast = deferred();

  const load = (ticket, response) =>
    response.promise.then((rows) => {
      if (!ticket.isStale()) applied.push(rows);
    });

  const oldRequest = load(gate.begin(), slow);
  const newRequest = load(gate.begin(), fast);
  fast.resolve("page for new filters");
  slow.resolve("page for old filters");
  await Promise.all([oldRequest, newRequest]);
  assert.deepEqual(applied, ["page for new filters"]);
});

test("unmount / cleanup aborts the current request", () => {
  const gate = createLatestRequestGate();
  const ticket = gate.begin();
  ticket.abort();
  assert.equal(ticket.signal.aborted, true);
  assert.equal(ticket.isStale(), true);

  const next = gate.begin();
  gate.abort();
  assert.equal(next.signal.aborted, true);
});

test("aborting an older ticket does not touch the newer one", () => {
  const gate = createLatestRequestGate();
  const older = gate.begin();
  const newer = gate.begin();
  older.abort();
  assert.equal(newer.signal.aborted, false);
  assert.equal(newer.isStale(), false);
});

test("abort errors are recognised so they never show an error toast", () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(isAbortError(controller.signal.reason), true);
  assert.equal(isAbortError(new DOMException("stopped", "AbortError")), true);
  assert.equal(isAbortError(new Error("Network")), false);
  assert.equal(isAbortError(null), false);
  assert.equal(isAbortError("AbortError"), false);
});

// ---- Dashboard query params ----

const BASE = {
  projectId: "proj-1",
  mode: "date",
  date: "2026-10-31",
  hull: "ALL",
  discipline: "ALL",
  keyword: "",
  page: 1,
  pageSize: 50
};

test("query params for a dated page", () => {
  const params = new URLSearchParams(buildInspectionListParams(BASE));
  assert.deepEqual(Object.fromEntries(params), {
    projectId: "proj-1",
    mode: "date",
    date: "2026-10-31",
    page: "1",
    pageSize: "50"
  });
});

test("ALL filters and blank keywords are left out, keyword is trimmed", () => {
  const params = new URLSearchParams(
    buildInspectionListParams({ ...BASE, hull: "H2", discipline: "HULL", keyword: "  block fairing " })
  );
  assert.equal(params.get("hull"), "H2");
  assert.equal(params.get("discipline"), "HULL");
  assert.equal(params.get("keyword"), "block fairing");
  assert.equal(new URLSearchParams(buildInspectionListParams({ ...BASE, keyword: "   " })).has("keyword"), false);
});

test("pending and open-comments modes do not send the date", () => {
  for (const mode of ["pending", "open-comments"]) {
    const params = new URLSearchParams(buildInspectionListParams({ ...BASE, mode }));
    assert.equal(params.get("mode"), mode);
    assert.equal(params.has("date"), false);
  }
});

test("page numbers are clamped to whole pages ≥ 1, facets only when asked", () => {
  const p = (input) => new URLSearchParams(buildInspectionListParams({ ...BASE, ...input }));
  assert.equal(p({ page: 0 }).get("page"), "1");
  assert.equal(p({ page: -3 }).get("page"), "1");
  assert.equal(p({ page: 2.7 }).get("page"), "2");
  assert.equal(p({ page: Number.NaN }).get("page"), "1");
  assert.equal(p({}).has("facets"), false);
  assert.equal(p({ facets: true }).get("facets"), "1");
});

test("unpaged params (export) and the filter key carry no page info", () => {
  const unpaged = new URLSearchParams(buildInspectionListParams({ ...BASE, page: 4, facets: true }, { paged: false }));
  assert.equal(unpaged.has("page"), false);
  assert.equal(unpaged.has("pageSize"), false);
  assert.equal(unpaged.has("facets"), false);
  assert.equal(inspectionListFilterKey({ ...BASE, page: 1 }), inspectionListFilterKey({ ...BASE, page: 9, pageSize: 100 }));
  assert.notEqual(inspectionListFilterKey(BASE), inspectionListFilterKey({ ...BASE, hull: "H1" }));
});
