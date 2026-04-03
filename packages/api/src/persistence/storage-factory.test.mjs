import test from "node:test";
import assert from "node:assert/strict";
import { createInspectionStorage, createInspectionStorageResolver } from "./storage-factory.ts";
import { D1InspectionStorage } from "./d1-inspection-storage.ts";
import { MockInspectionDatabase } from "./mock-inspection-db.ts";

test("createInspectionStorage defaults to mock storage", () => {
  const storage = createInspectionStorage();
  assert.equal(storage instanceof MockInspectionDatabase, true);
});

test("createInspectionStorage keeps mock storage when D1 driver is requested without binding", () => {
  const storage = createInspectionStorage({ D1_DRIVER: "d1" });
  assert.equal(storage instanceof MockInspectionDatabase, true);
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

  assert.equal(storage instanceof D1InspectionStorage, true);
});

test("createInspectionStorageResolver reuses the same mock storage across calls", () => {
  const resolveStorage = createInspectionStorageResolver();
  const first = resolveStorage();
  const second = resolveStorage();

  assert.equal(first instanceof MockInspectionDatabase, true);
  assert.equal(first, second);
});
