import test from "node:test";
import assert from "node:assert/strict";
import { createObservationTypeRoutes } from "./observation-types.ts";
import { issueAccessToken } from "../auth/jwt.ts";
import { createBaselineInspectionStorage } from "../test-support/baseline-fixture.mjs";
import { createSqliteD1Env } from "../test-support/sqlite-d1.mjs";

// The route reads and writes c.env.DB directly and sits behind requireAuth +
// admin role, so the test runs it against an in-memory SQLite D1 with the real
// schema and an admin token (the former "mock mode" no longer exists).
const NOW = "2026-04-03T09:00:00.000Z";

function createEnv() {
  return createSqliteD1Env({
    ...createBaselineInspectionStorage(),
    observationTypes: [
      { id: "obs-type-patrol", code: "patrol", label: "Patrol", sortOrder: 1, createdAt: NOW, updatedAt: NOW },
      { id: "obs-type-sea-trial", code: "sea_trial", label: "Sea Trial", sortOrder: 2, createdAt: NOW, updatedAt: NOW }
    ]
  });
}

async function authHeaders(claims, env) {
  return { authorization: `Bearer ${await issueAccessToken(claims, env)}` };
}

test("PUT / updates observation type against the D1 schema", async () => {
  const app = createObservationTypeRoutes();
  const env = createEnv();
  const headers = await authHeaders({ id: "user-admin-chen", role: "admin", disciplines: [] }, env);

  const listResponse = await app.request("http://localhost/", { headers }, env);
  const listPayload = await listResponse.json();
  const [first] = listPayload.data;

  assert.equal(listResponse.status, 200);
  assert.equal(first.id, "obs-type-patrol");

  const response = await app.request(
    `http://localhost/${first.id}`,
    {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Updated Label", sortOrder: 99 })
    },
    env
  );

  assert.equal(response.status, 200);

  const verifyResponse = await app.request("http://localhost/", { headers }, env);
  const verifyPayload = await verifyResponse.json();
  const updated = verifyPayload.data.find((item) => item.id === first.id);

  assert.equal(updated.label, "Updated Label");
  assert.equal(updated.sortOrder, 99);
});

test("PUT / returns 404 for an unknown observation type", async () => {
  const app = createObservationTypeRoutes();
  const env = createEnv();
  const headers = await authHeaders({ id: "user-admin-chen", role: "admin", disciplines: [] }, env);

  const response = await app.request(
    "http://localhost/obs-type-missing",
    {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Nope" })
    },
    env
  );

  assert.equal(response.status, 404);
});

test("PUT / is admin only", async () => {
  const app = createObservationTypeRoutes();
  const env = createEnv();
  const headers = await authHeaders({ id: "user-inspector-li", role: "inspector", disciplines: ["PAINT"] }, env);

  const response = await app.request(
    "http://localhost/obs-type-patrol",
    {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Hijacked" })
    },
    env
  );

  assert.equal(response.status, 403);
});
