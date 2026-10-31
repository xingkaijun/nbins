import test from "node:test";
import assert from "node:assert/strict";

import { getInspectionWriteBlockReason } from "./inspection-permissions.ts";

test("inspector may write only inside an assigned discipline (mirrors routes/inspections.ts)", () => {
  const inspector = { role: "inspector", disciplines: ["HULL", "PAINTING"] };

  assert.equal(getInspectionWriteBlockReason(inspector, "HULL"), null);
  assert.match(getInspectionWriteBlockReason(inspector, "MACHINERY") ?? "", /not assigned to the MACHINERY discipline/);
});

test("inspector without disciplines is read only", () => {
  assert.ok(getInspectionWriteBlockReason({ role: "inspector", disciplines: [] }, "HULL"));
  assert.ok(getInspectionWriteBlockReason({ role: "inspector", disciplines: null }, "HULL"));
});

test("admin, manager and reviewer are not limited by discipline", () => {
  for (const role of ["admin", "manager", "reviewer"]) {
    assert.equal(getInspectionWriteBlockReason({ role, disciplines: [] }, "HULL"), null, role);
  }
});

test("no session means no writes", () => {
  assert.ok(getInspectionWriteBlockReason(null, "HULL"));
});
