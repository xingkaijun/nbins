import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../index.ts";

function createTestApp() {
  return createApp();
}

test("GET /api/inspections/:id returns inspection detail", async () => {
  const app = createTestApp();
  const response = await app.request("http://localhost/api/inspections/insp-002");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.id, "insp-002");
  assert.equal(payload.data.lastRoundResult, "QCC");
  assert.equal(payload.data.openCommentCount, 2);
  assert.equal(payload.data.comments[0].status, "open");
});

test("GET /api/inspections/:id returns 404 for unknown inspection items", async () => {
  const app = createTestApp();
  const response = await app.request("http://localhost/api/inspections/insp-missing");
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item not found");
});

test("PUT /api/inspections/:id/rounds/current/result accepts QCC with comments", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-003/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:00:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Wang Wu",
        notes: "Accepted with tracking comments.",
        expectedVersion: 5,
        comments: [{ message: "Monitor one repaired weld during close-out." }]
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.item.lastRoundResult, "QCC");
  assert.equal(payload.data.item.workflowStatus, "open");
  assert.equal(payload.data.item.waitingForNextRound, false);
  assert.equal(payload.data.item.openCommentCount, 2);
  assert.equal(payload.data.item.version, 6);
});

test("PUT /api/inspections/:id/rounds/current/result accepts CX without adding comments", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-003/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        result: "CX",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:15:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Wang Wu",
        expectedVersion: 5,
        comments: []
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.item.workflowStatus, "cancelled");
  assert.equal(payload.data.item.resolvedResult, "CX");
  assert.equal(payload.data.item.openCommentCount, 1);
  assert.equal(payload.data.item.waitingForNextRound, false);
});

test("PUT /api/inspections/:id/rounds/current/result rejects AA with new comments", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        result: "AA",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:30:00.000Z",
        submittedBy: "user-inspector-li",
        inspectorDisplayName: "Li Si",
        expectedVersion: 3,
        comments: [{ message: "This should fail." }]
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /AA submissions cannot introduce new open comments/);
});

test("PUT /api/inspections/:id/rounds/current/result enforces optimistic locking", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T12:00:00.000Z",
        submittedBy: "user-inspector-li",
        inspectorDisplayName: "Li Si",
        expectedVersion: 1,
        comments: []
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item version conflict");
});

test("PUT /api/inspections/:id/rounds/current/result returns 400 for malformed JSON", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{"
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Request body must be valid JSON");
});

test("PUT /api/inspections/:id/rounds/current/result returns 400 for non-object JSON", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify("not-an-object")
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Request body must be an object");
});

test("PUT /api/inspections/:id/rounds/current/result returns 400 for invalid request fields", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T12:00:00.000Z",
        submittedBy: "   ",
        inspectorDisplayName: "Li Si",
        expectedVersion: 3,
        comments: [{ message: "Open one more tracking item" }]
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /submittedBy is required/);
});

test("PUT /api/inspections/:id/rounds/current/result returns 404 for unknown inspection items", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-missing/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T12:15:00.000Z",
        submittedBy: "user-inspector-li",
        inspectorDisplayName: "Li Si",
        expectedVersion: 1,
        comments: []
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item not found");
});
