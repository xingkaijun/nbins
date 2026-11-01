import test from "node:test";
import assert from "node:assert/strict";

import {
  SAVED_FLASH_MS,
  createKeyedSaveController,
  createSaveController,
  inspectionSavedMessage,
  saveButtonLabel,
  saveErrorMessage
} from "./save-state.ts";
import { createFakeTimers, deferred } from "./test-helpers/fake-timers.mjs";

test("save button label follows the state", () => {
  assert.equal(saveButtonLabel("idle", "SUBMIT"), "SUBMIT");
  assert.equal(saveButtonLabel("saving", "SUBMIT"), "Saving…");
  assert.equal(saveButtonLabel("saved", "SUBMIT"), "Saved ✓");
  assert.equal(saveButtonLabel("saving", "Publish", { saving: "Publishing…", saved: "Published ✓" }), "Publishing…");
  assert.equal(saveButtonLabel("saved", "Publish", { saving: "Publishing…", saved: "Published ✓" }), "Published ✓");
});

test("idle → saving → saved → idle after the flash time", async () => {
  const clock = createFakeTimers();
  const seen = [];
  const controller = createSaveController((state) => seen.push(state), { timers: clock.api });
  const request = deferred();

  const running = controller.run(() => request.promise);
  assert.equal(controller.state, "saving");
  request.resolve("ok");
  assert.equal(await running, "ok");
  assert.equal(controller.state, "saved");

  clock.advance(SAVED_FLASH_MS - 1);
  assert.equal(controller.state, "saved");
  clock.advance(1);
  assert.equal(controller.state, "idle");
  assert.deepEqual(seen, ["saving", "saved", "idle"]);
});

test("a second run while saving is ignored (no double submit)", async () => {
  const clock = createFakeTimers();
  const controller = createSaveController(() => {}, { timers: clock.api });
  const request = deferred();
  let calls = 0;

  const first = controller.run(() => {
    calls += 1;
    return request.promise;
  });
  const second = await controller.run(() => {
    calls += 1;
    return Promise.resolve("second");
  });
  assert.equal(second, undefined);
  assert.equal(calls, 1);

  request.resolve("first");
  assert.equal(await first, "first");
});

test("a failed save goes back to idle and passes the error on", async () => {
  const clock = createFakeTimers();
  const seen = [];
  const controller = createSaveController((state) => seen.push(state), { timers: clock.api });

  await assert.rejects(controller.run(() => Promise.reject(new Error("409 conflict"))), /409 conflict/);
  assert.equal(controller.state, "idle");
  assert.deepEqual(seen, ["saving", "idle"]);
  assert.equal(clock.pending(), 0, "no Saved ✓ reset timer after a failure");

  // The button works again right away.
  assert.equal(await controller.run(() => Promise.resolve(1)), 1);
});

test("saving again during the Saved ✓ flash restarts cleanly", async () => {
  const clock = createFakeTimers();
  const controller = createSaveController(() => {}, { timers: clock.api, savedMs: 1000 });
  await controller.run(() => Promise.resolve());
  clock.advance(600);
  await controller.run(() => Promise.resolve());
  clock.advance(600);
  assert.equal(controller.state, "saved", "the old reset timer was cleared");
  clock.advance(400);
  assert.equal(controller.state, "idle");
});

test("dispose clears the pending reset timer", async () => {
  const clock = createFakeTimers();
  const controller = createSaveController(() => {}, { timers: clock.api });
  await controller.run(() => Promise.resolve());
  assert.equal(clock.pending(), 1);
  controller.dispose();
  assert.equal(clock.pending(), 0);
});

test("keyed saves: each row has its own state and its own double-click guard", async () => {
  const clock = createFakeTimers();
  let latest = new Map();
  const controller = createKeyedSaveController((states) => {
    latest = states;
  }, { timers: clock.api });
  const a = deferred();
  const b = deferred();

  const runA = controller.run("fat-a", () => a.promise);
  const runB = controller.run("fat-b", () => b.promise);
  assert.equal(controller.stateOf("fat-a"), "saving");
  assert.equal(controller.stateOf("fat-b"), "saving");
  assert.equal(controller.stateOf("fat-c"), "idle");
  assert.equal(await controller.run("fat-a", () => Promise.resolve("again")), undefined);

  a.resolve("A");
  assert.equal(await runA, "A");
  assert.equal(controller.stateOf("fat-a"), "saved");
  assert.equal(controller.stateOf("fat-b"), "saving");

  b.reject(new Error("boom"));
  await assert.rejects(runB, /boom/);
  assert.equal(controller.stateOf("fat-b"), "idle");

  clock.advance(SAVED_FLASH_MS);
  assert.equal(controller.stateOf("fat-a"), "idle");
  assert.equal(latest.size, 0, "idle rows are dropped from the emitted map");
});

test("keyed dispose clears every row's reset timer", async () => {
  const clock = createFakeTimers();
  const controller = createKeyedSaveController(() => {}, { timers: clock.api });
  await controller.run("a", () => Promise.resolve());
  await controller.run("b", () => Promise.resolve());
  assert.equal(clock.pending(), 2);
  controller.dispose();
  assert.equal(clock.pending(), 0);
});

test("success toast names the resulting status", () => {
  assert.equal(inspectionSavedMessage("QC RECHECK"), "Saved · QC RECHECK");
  assert.equal(inspectionSavedMessage("  ACCEPTED  "), "Saved · ACCEPTED");
  assert.equal(inspectionSavedMessage(null), "Saved");
  assert.equal(inspectionSavedMessage(""), "Saved");
  assert.equal(inspectionSavedMessage("QC RECHECK", { demo: true }), "Saved · QC RECHECK (demo mode, not sent to the server)");
});

test("error toast keeps the server's reason", () => {
  assert.equal(saveErrorMessage("Save FAT", new Error("Version conflict")), "Save FAT failed: Version conflict");
  assert.equal(saveErrorMessage("Submit", "offline"), "Submit failed: offline");
  assert.equal(saveErrorMessage("Submit", {}), "Submit failed: Unknown error");
  assert.equal(saveErrorMessage("Submit", new Error("   ")), "Submit failed: Unknown error");
});
