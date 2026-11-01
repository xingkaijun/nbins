import test from "node:test";
import assert from "node:assert/strict";

import { ROW_FLASH_MS, createRowFlash, rowsToFlash } from "./row-flash.ts";
import { createFakeTimers } from "./test-helpers/fake-timers.mjs";

test("a triggered row flashes for ROW_FLASH_MS, then stops", () => {
  const clock = createFakeTimers();
  const emitted = [];
  const flash = createRowFlash((ids) => emitted.push([...ids].sort()), { timers: clock.api });

  flash.trigger("row-1");
  assert.equal(flash.isFlashing("row-1"), true);
  assert.deepEqual(emitted.at(-1), ["row-1"]);

  clock.advance(ROW_FLASH_MS - 1);
  assert.equal(flash.isFlashing("row-1"), true);
  clock.advance(1);
  assert.equal(flash.isFlashing("row-1"), false);
  assert.deepEqual(emitted.at(-1), []);
});

test("triggering the same row again restarts its timer", () => {
  const clock = createFakeTimers();
  const flash = createRowFlash(() => {}, { timers: clock.api, durationMs: 1000 });
  flash.trigger("row-1");
  clock.advance(700);
  flash.trigger("row-1");
  clock.advance(700);
  assert.equal(flash.isFlashing("row-1"), true);
  assert.equal(clock.pending(), 1, "only one timer per row");
  clock.advance(300);
  assert.equal(flash.isFlashing("row-1"), false);
});

test("rows flash independently", () => {
  const clock = createFakeTimers();
  let current = new Set();
  const flash = createRowFlash((ids) => {
    current = ids;
  }, { timers: clock.api, durationMs: 1000 });
  flash.trigger("a");
  clock.advance(500);
  flash.trigger("b");
  assert.deepEqual([...current].sort(), ["a", "b"]);
  clock.advance(500);
  assert.deepEqual([...current], ["b"]);
  clock.advance(500);
  assert.deepEqual([...current], []);
});

test("dispose stops pending flashes", () => {
  const clock = createFakeTimers();
  const flash = createRowFlash(() => {}, { timers: clock.api });
  flash.trigger("a");
  flash.trigger("b");
  flash.dispose();
  assert.equal(clock.pending(), 0);
  assert.equal(flash.isFlashing("a"), false);
});

test("only updated rows on the current page flash, once each", () => {
  assert.deepEqual(rowsToFlash(["a", "b", "c"], ["b", "x", "b", "c"]), ["b", "c"]);
  assert.deepEqual(rowsToFlash(["a"], ["x"]), []);
  assert.deepEqual(rowsToFlash([], ["a"]), []);
});
