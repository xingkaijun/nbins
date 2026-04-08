import test from "node:test";
import assert from "node:assert/strict";
import { resolveInspectionItemState } from "./inspection-item-state.ts";

test("AA stays open when open comments still exist", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "AA",
    openCommentCount: 2,
    totalCommentCount: 2
  });

  assert.equal(state.workflowStatus, "open");
  assert.equal(state.resolvedResult, null);
  assert.equal(state.pendingFinalAcceptance, true);
  assert.equal(state.waitingForNextRound, false);
});

test("AA closes when no open comments remain", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "AA",
    openCommentCount: 0,
    totalCommentCount: 0
  });

  assert.equal(state.workflowStatus, "closed");
  assert.equal(state.resolvedResult, "AA");
  assert.equal(state.pendingFinalAcceptance, false);
});

test("QCC auto-resolves to AA when it has closed comments", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "QCC",
    openCommentCount: 0,
    totalCommentCount: 1
  });

  assert.equal(state.workflowStatus, "closed");
  assert.equal(state.resolvedResult, "AA");
  assert.equal(state.autoClosedFromComments, true);
});

test("QCC matches result if it has no comments at all", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "QCC",
    openCommentCount: 0,
    totalCommentCount: 0
  });

  assert.equal(state.workflowStatus, "closed");
  assert.equal(state.resolvedResult, "QCC");
  assert.equal(state.autoClosedFromComments, false);
});

test("QCC stays open while comments are still unresolved", () => {
  const state = resolveInspectionItemState({
    latestSubmittedResult: "QCC",
    openCommentCount: 1,
    totalCommentCount: 1
  });

  assert.equal(state.workflowStatus, "open");
  assert.equal(state.resolvedResult, null);
  assert.equal(state.pendingFinalAcceptance, true);
});

test("OWC and RJ both wait for a future round", async (t) => {
  await t.test("OWC with comments", () => {
    const state = resolveInspectionItemState({
      latestSubmittedResult: "OWC",
      openCommentCount: 1,
      totalCommentCount: 1
    });

    assert.equal(state.workflowStatus, "open");
    assert.equal(state.waitingForNextRound, true);
    assert.equal(state.resolvedResult, null);
  });

  await t.test("OWC without comments matches result", () => {
    const state = resolveInspectionItemState({
      latestSubmittedResult: "OWC",
      openCommentCount: 0,
      totalCommentCount: 0
    });

    assert.equal(state.workflowStatus, "open");
    assert.equal(state.waitingForNextRound, true);
    assert.equal(state.resolvedResult, "OWC");
  });

  await t.test("OWC with closed comments forced to AA", () => {
    const state = resolveInspectionItemState({
      latestSubmittedResult: "OWC",
      openCommentCount: 0,
      totalCommentCount: 1
    });

    assert.equal(state.workflowStatus, "closed");
    assert.equal(state.resolvedResult, "AA");
  });

  await t.test("RJ", () => {
    const state = resolveInspectionItemState({
      latestSubmittedResult: "RJ",
      openCommentCount: 0,
      totalCommentCount: 0
    });

    assert.equal(state.workflowStatus, "open");
    assert.equal(state.waitingForNextRound, true);
    assert.equal(state.resolvedResult, "RJ");
  });
});

