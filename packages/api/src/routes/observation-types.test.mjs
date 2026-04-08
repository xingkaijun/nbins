import test from "node:test";
import assert from "node:assert/strict";
import { createObservationTypeRoutes } from "./observation-types.ts";

test("PUT / updates observation type in mock mode", async () => {
  const app = createObservationTypeRoutes();

  const listResponse = await app.request("http://localhost/");
  const listPayload = await listResponse.json();
  const [first] = listPayload.data;

  const response = await app.request(`http://localhost/${first.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "Updated Label", sortOrder: 99 })
  });

  assert.equal(response.status, 200);

  const verifyResponse = await app.request("http://localhost/");
  const verifyPayload = await verifyResponse.json();
  const updated = verifyPayload.data.find((item) => item.id === first.id);

  assert.equal(updated.label, "Updated Label");
  assert.equal(updated.sortOrder, 99);
});
