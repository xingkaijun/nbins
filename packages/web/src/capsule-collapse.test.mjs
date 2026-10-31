import test from "node:test";
import assert from "node:assert/strict";

import { CAPSULE_HYSTERESIS_PX, decideCapsuleCompact } from "./capsule-collapse.ts";

test("collapses when the full buttons stop fitting", () => {
  assert.equal(decideCapsuleCompact(false, 800, 700), false);
  assert.equal(decideCapsuleCompact(false, 700, 700), false);
  assert.equal(decideCapsuleCompact(false, 699, 700), true);
});

test("expands again only with room to spare (no flip-flop at the threshold)", () => {
  assert.equal(decideCapsuleCompact(true, 700, 700), true);
  assert.equal(decideCapsuleCompact(true, 700 + CAPSULE_HYSTERESIS_PX - 1, 700), true);
  assert.equal(decideCapsuleCompact(true, 700 + CAPSULE_HYSTERESIS_PX, 700), false);
});

test("keeps the previous state when nothing could be measured", () => {
  assert.equal(decideCapsuleCompact(true, 0, 700), true);
  assert.equal(decideCapsuleCompact(false, 500, 0), false);
  assert.equal(decideCapsuleCompact(false, Number.NaN, 700), false);
});
