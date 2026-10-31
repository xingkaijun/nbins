import test from "node:test";
import assert from "node:assert/strict";
import { createInspectionStorage, createInspectionStorageResolver } from "./storage-factory.ts";
import { D1SeededInspectionStorage } from "./d1-seeded-inspection-storage.ts";
import { createTestDatabase } from "../test-support/test-database.mjs";

// The mock storage driver was removed on purpose (commit 84b37ac): the API
// needs its SQLite database and refuses to serve a request without one instead
// of silently falling back to in-memory data. These tests pin that contract.

test("createInspectionStorage without bindings fails loudly instead of falling back to mock storage", () => {
  assert.throws(() => createInspectionStorage(), /DATABASE_NOT_CONFIGURED/);
});

test("createInspectionStorage fails when bindings are present but the database is missing", () => {
  assert.throws(() => createInspectionStorage({ JWT_SECRET: "x" }), /DATABASE_NOT_CONFIGURED/);
});

test("createInspectionStorage returns database-backed storage when the database is present", () => {
  const storage = createInspectionStorage({
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

test("createInspectionStorageResolver returns database-backed storage over the request's database and rejects a missing one", async () => {
  const resolveStorage = createInspectionStorageResolver();
  const db = createTestDatabase();
  const first = resolveStorage({ DB: db });
  const second = resolveStorage({ DB: db });

  assert.equal(first instanceof D1SeededInspectionStorage, true);
  assert.equal(second instanceof D1SeededInspectionStorage, true);
  assert.throws(() => resolveStorage(), /DATABASE_NOT_CONFIGURED/);

  // Both resolve to the same database: a write through one is visible to the other.
  await first.readUserByUsername("nobody");
  const viaSecond = await second.read();
  assert.ok(viaSecond.users.length > 0, "empty D1 is seeded on first use");
});
