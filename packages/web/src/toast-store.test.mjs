import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_VISIBLE_TOASTS,
  dismissToast,
  normalizeToastMessage,
  pushToast,
  toastDuration,
  toastLiveRole
} from "./toast-store.ts";

test("errors use the assertive alert region and stay longer", () => {
  assert.equal(toastLiveRole("error"), "alert");
  assert.equal(toastLiveRole("success"), "status");
  assert.equal(toastLiveRole("info"), "status");
  assert.ok(toastDuration("error") > toastDuration("success"));
});

test("pushToast appends, dedupes identical visible messages and caps the queue", () => {
  let queue = [];
  queue = pushToast(queue, "success", "Saved.", 1).queue;
  queue = pushToast(queue, "error", "Failed.", 2).queue;
  assert.deepEqual(queue.map((t) => t.id), [1, 2]);

  queue = pushToast(queue, "success", "Saved.", 3).queue;
  assert.equal(queue.length, 2, "a repeat bumps the existing toast");
  assert.deepEqual(queue.map((t) => [t.id, t.count]), [[2, 1], [3, 2]]);

  for (let id = 4; id < 4 + MAX_VISIBLE_TOASTS + 2; id += 1) {
    queue = pushToast(queue, "info", `Message ${id}`, id).queue;
  }
  assert.equal(queue.length, MAX_VISIBLE_TOASTS);
  assert.equal(queue.at(-1).message, `Message ${3 + MAX_VISIBLE_TOASTS + 2}`);
});

test("dismissToast removes by id", () => {
  const { queue } = pushToast([], "info", "Hello", 7);
  assert.deepEqual(dismissToast(queue, 7), []);
  assert.equal(dismissToast(queue, 8).length, 1);
});

test("normalizeToastMessage accepts errors and strings", () => {
  assert.equal(normalizeToastMessage(new Error(" Boom ")), "Boom");
  assert.equal(normalizeToastMessage(""), "Something went wrong.");
  assert.equal(normalizeToastMessage(undefined, "Fallback"), "Fallback");
});
