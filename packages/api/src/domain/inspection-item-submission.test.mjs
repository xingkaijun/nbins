import test from "node:test";
import assert from "node:assert/strict";
import { applyInspectionResultSubmission } from "./inspection-item-submission.ts";

test("AA with no comments closes the item", () => {
  const output = applyInspectionResultSubmission({
    item: createBaseItem(),
    submission: createSubmission({ result: "AA" })
  });

  assert.equal(output.item.workflowStatus, "closed");
  assert.equal(output.item.resolvedResult, "AA");
  assert.equal(output.item.openCommentCount, 0);
  assert.equal(output.item.waitingForNextRound, false);
});

test("AA with historical open comments stays open", () => {
  const output = applyInspectionResultSubmission({
    item: createBaseItem({
      comments: [createOpenComment("c-1", "Existing open comment")],
      openCommentCount: 1
    }),
    submission: createSubmission({ result: "AA" })
  });

  assert.equal(output.item.workflowStatus, "open");
  assert.equal(output.item.resolvedResult, null);
  assert.equal(output.item.pendingFinalAcceptance, true);
});

test("invalid AA with new comments throws", () => {
  assert.throws(
    () =>
      applyInspectionResultSubmission({
        item: createBaseItem(),
        submission: createSubmission({
          result: "AA",
          comments: [{ message: "Not allowed on AA" }]
        })
      }),
    /cannot introduce new open comments/
  );
});

test("QCC with comments stays in the current round", () => {
  const output = applyInspectionResultSubmission({
    item: createBaseItem(),
    submission: createSubmission({
      result: "QCC",
      comments: [{ message: "Touch up one edge" }]
    })
  });

  assert.equal(output.item.workflowStatus, "open");
  assert.equal(output.item.waitingForNextRound, false);
  assert.equal(output.createdRoundHistoryEntry.roundNumber, 1);
  assert.equal(output.createdComments.length, 1);
});

test("OWC with comments sets waiting-for-next-round semantics", () => {
  const output = applyInspectionResultSubmission({
    item: createBaseItem(),
    submission: createSubmission({
      result: "OWC",
      comments: [{ message: "Reinspect after weld repair" }]
    })
  });

  assert.equal(output.item.workflowStatus, "open");
  assert.equal(output.item.waitingForNextRound, true);
  assert.equal(output.item.resolvedResult, null);
});

test("RJ without comments still waits for the next round", () => {
  const output = applyInspectionResultSubmission({
    item: createBaseItem(),
    submission: createSubmission({ result: "RJ" })
  });

  assert.equal(output.item.waitingForNextRound, true);
  assert.equal(output.item.openCommentCount, 0);
});

test("RJ with comments stays open and keeps comments", () => {
  const output = applyInspectionResultSubmission({
    item: createBaseItem(),
    submission: createSubmission({
      result: "RJ",
      comments: [{ message: "Dimension exceeds tolerance" }]
    })
  });

  assert.equal(output.item.workflowStatus, "open");
  assert.equal(output.item.waitingForNextRound, true);
  assert.equal(output.item.openCommentCount, 1);
});

test("CX cancels the item", () => {
  const output = applyInspectionResultSubmission({
    item: createBaseItem(),
    submission: createSubmission({ result: "CX" })
  });

  assert.equal(output.item.workflowStatus, "cancelled");
  assert.equal(output.item.resolvedResult, "CX");
  assert.equal(output.item.waitingForNextRound, false);
});

function createBaseItem(overrides = {}) {
  return {
    id: "insp-test-001",
    projectCode: "P-TEST",
    projectName: "Test Project",
    hullNumber: "H-TEST",
    shipName: "NBTEST",
    itemName: "Inspection Test Item",
    discipline: "ENGINE",
    source: "manual",
    yardQc: "Yard QC",
    plannedDate: "2026-04-03",
    actualDate: null,
    currentRound: 1,
    currentRoundId: "round-insp-test-001-r1",
    version: 1,
    workflowStatus: "pending",
    resolvedResult: null,
    lastRoundResult: null,
    openCommentCount: 0,
    pendingFinalAcceptance: false,
    waitingForNextRound: false,
    comments: [],
    roundHistory: [],
    ...overrides
  };
}

function createSubmission(overrides) {
  return {
    result: overrides.result,
    actualDate: "2026-04-03",
    submittedAt: "2026-04-03T10:00:00.000Z",
    submittedBy: "user-inspector-test",
    inspectorDisplayName: "Inspector Test",
    expectedVersion: 1,
    comments: overrides.comments,
    ...overrides
  };
}

function createOpenComment(id, message) {
  return {
    id,
    roundNumber: 1,
    status: "open",
    message,
    createdAt: "2026-04-02T10:00:00.000Z",
    createdBy: "Inspector Existing",
    resolvedAt: null,
    resolvedBy: null
  };
}
