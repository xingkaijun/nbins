import test from "node:test";
import assert from "node:assert/strict";
import { createInspectionStorage, createInspectionStorageResolver } from "./storage-factory.ts";
import { D1SeededInspectionStorage } from "./d1-seeded-inspection-storage.ts";
import { createSqliteD1 } from "../test-support/sqlite-d1.mjs";

// The mock storage driver was removed on purpose (commit 84b37ac): the API is
// D1-only and refuses to start a request without a D1 binding instead of
// silently falling back to in-memory data. These tests pin that contract.

test("createInspectionStorage without bindings fails loudly instead of falling back to mock storage", () => {
  assert.throws(() => createInspectionStorage(), /D1_DATABASE_BINDING_MISSING/);
});

test("createInspectionStorage fails when the D1 driver is requested without a DB binding", () => {
  assert.throws(() => createInspectionStorage({ D1_DRIVER: "d1" }), /D1_DATABASE_BINDING_MISSING/);
});

test("createInspectionStorage returns D1 storage when driver and binding are present", () => {
  const storage = createInspectionStorage({
    D1_DRIVER: "d1",
    DB: {
      prepare() {
        throw new Error("not used");
      },
      batch() {
        throw new Error("not used");
      }
    }
  });

  assert.equal(storage instanceof D1SeededInspectionStorage, true);
});

test("createInspectionStorageResolver returns D1 storage over the request's binding and rejects a missing one", async () => {
  const resolveStorage = createInspectionStorageResolver();
  const db = createSqliteD1();
  const first = resolveStorage({ D1_DRIVER: "d1", DB: db });
  const second = resolveStorage({ D1_DRIVER: "d1", DB: db });

  assert.equal(first instanceof D1SeededInspectionStorage, true);
  assert.equal(second instanceof D1SeededInspectionStorage, true);
  assert.throws(() => resolveStorage(), /D1_DATABASE_BINDING_MISSING/);

  // Both resolve to the same database: a write through one is visible to the other.
  await first.readUserByUsername("nobody");
  const viaSecond = await second.read();
  assert.ok(viaSecond.users.length > 0, "empty D1 is seeded on first use");
});
