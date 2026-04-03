import test from "node:test";
import assert from "node:assert/strict";
import { resolveInspectionItemState } from "./inspection-item-state.ts";

test("AA stays open when open comments still exist", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "AA",
    openCommentCount: 2
  });

  assert.equal(state.workflowStatus, "open");
  assert.equal(state.resolvedResult, null);
  assert.equal(state.pendingFinalAcceptance, true);
  assert.equal(state.waitingForNextRound, false);
});

test("AA closes when no open comments remain", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "AA",
    openCommentCount: 0
  });

  assert.equal(state.workflowStatus, "closed");
  assert.equal(state.resolvedResult, "AA");
  assert.equal(state.pendingFinalAcceptance, false);
});

test("QCC auto-resolves to AA when comment count reaches zero", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "QCC",
    openCommentCount: 0
  });

  assert.equal(state.workflowStatus, "closed");
  assert.equal(state.resolvedResult, "AA");
  assert.equal(state.autoClosedFromComments, true);
  assert.equal(state.waitingForNextRound, false);
});

test("QCC stays open while comments are still unresolved", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "QCC",
    openCommentCount: 1
  });

  assert.equal(state.workflowStatus, "open");
  assert.equal(state.resolvedResult, null);
  assert.equal(state.pendingFinalAcceptance, true);
  assert.equal(state.autoClosedFromComments, false);
});

test("OWC and RJ both wait for a future round", async (t) => {
  await t.test("OWC", () => {
    const state = resolveInspectionItemState({
      latestSubmittedResult: "OWC",
      openCommentCount: 1
    });

    assert.equal(state.workflowStatus, "open");
    assert.equal(state.waitingForNextRound, true);
    assert.equal(state.resolvedResult, null);
  });

  await t.test("RJ", () => {
    const state = resolveInspectionItemState({
      latestSubmittedResult: "RJ",
      openCommentCount: 0
    });

    assert.equal(state.workflowStatus, "open");
    assert.equal(state.waitingForNextRound, true);
    assert.equal(state.resolvedResult, null);
  });
});

