import test from "node:test";
import assert from "node:assert/strict";

import { getCommentActions, mergeCommentFromDetail } from "./comment-permissions.ts";

const open = { status: "open", discipline: "HULL" };
const closed = { status: "closed", discipline: "HULL" };

test("signed-out users get no actions", () => {
  const actions = getCommentActions(null, open);
  assert.equal(actions.canHighlight, false);
  assert.equal(actions.canResolve, false);
  assert.equal(actions.canEditContent, false);
  assert.ok(actions.writeBlockReason);
});

test("inspector inside their discipline can resolve and remark an open comment", () => {
  const user = { role: "inspector", disciplines: ["HULL"] };
  assert.deepEqual(getCommentActions(user, open), {
    canHighlight: true,
    canResolve: true,
    canRemark: true,
    canReopen: false,
    canEditContent: false,
    writeBlockReason: null
  });
  const onClosed = getCommentActions(user, closed);
  assert.equal(onClosed.canReopen, true);
  assert.equal(onClosed.canResolve, false);
  assert.equal(onClosed.canRemark, false);
});

test("inspector outside the discipline may only highlight (same as the API 403)", () => {
  const user = { role: "inspector", disciplines: ["PAINT"] };
  const actions = getCommentActions(user, open);
  assert.equal(actions.canHighlight, true);
  assert.equal(actions.canResolve, false);
  assert.equal(actions.canRemark, false);
  assert.equal(getCommentActions(user, closed).canReopen, false);
  assert.match(actions.writeBlockReason ?? "", /HULL/);
});

test("managers and reviewers are not limited by discipline; only admins edit content", () => {
  for (const role of ["manager", "reviewer"]) {
    const actions = getCommentActions({ role, disciplines: [] }, open);
    assert.equal(actions.canResolve, true, role);
    assert.equal(actions.canEditContent, false, role);
  }
  const admin = getCommentActions({ role: "admin", disciplines: [] }, closed);
  assert.equal(admin.canReopen, true);
  assert.equal(admin.canEditContent, true);
});

test("mergeCommentFromDetail copies the server state of the same comment only", () => {
  const view = { id: "c1", content: "old", status: "open", closedAt: null, closedBy: null, resolveRemark: null, hullNumber: "H1" };
  const detail = {
    comments: [
      { id: "c0", message: "other", status: "closed", resolvedAt: "x", resolvedBy: "u", resolveRemark: "r" },
      { id: "c1", message: "new", status: "closed", resolvedAt: "2026-10-31T10:00:00Z", resolvedBy: "u1", resolveRemark: "done" }
    ]
  };
  assert.deepEqual(mergeCommentFromDetail(view, detail), {
    id: "c1", content: "new", status: "closed", closedAt: "2026-10-31T10:00:00Z", closedBy: "u1", resolveRemark: "done", hullNumber: "H1"
  });
  assert.equal(mergeCommentFromDetail(view, { comments: [] }), view);
});
