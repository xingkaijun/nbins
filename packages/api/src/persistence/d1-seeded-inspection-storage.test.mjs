import test from "node:test";
import assert from "node:assert/strict";
import { D1SeededInspectionStorage } from "./d1-seeded-inspection-storage.ts";
import { createSeedInspectionStorageSnapshot } from "./seed.ts";

const EMPTY_SNAPSHOT = {
  users: [],
  projects: [],
  ships: [],
  inspectionItems: [],
  inspectionRounds: [],
  comments: []
};

test("D1SeededInspectionStorage seeds when storage is empty", async () => {
  const writes = [];

  const inner = {
    snapshot: structuredClone(EMPTY_SNAPSHOT),
    async read() {
      return this.snapshot;
    },
    async write(next) {
      writes.push(next);
      this.snapshot = next;
    }
  };

  const seeded = new D1SeededInspectionStorage(inner);
  const snapshot = await seeded.read();

  assert.equal(writes.length, 1);
  assert.equal(snapshot.inspectionItems.length, createSeedInspectionStorageSnapshot().inspectionItems.length);
});

test("D1SeededInspectionStorage does not seed when storage already has data", async () => {
  const baseline = createSeedInspectionStorageSnapshot();
  const writes = [];

  const inner = {
    snapshot: baseline,
    async read() {
      return this.snapshot;
    },
    async write(next) {
      writes.push(next);
      this.snapshot = next;
    }
  };

  const seeded = new D1SeededInspectionStorage(inner);
  const snapshot = await seeded.read();

  assert.equal(writes.length, 0);
  assert.equal(snapshot.inspectionItems.length, baseline.inspectionItems.length);
});
