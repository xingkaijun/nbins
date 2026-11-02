import test from "node:test";
import assert from "node:assert/strict";
import {
  iterateInspectionList,
  queryInspectionListPage,
  buildInspectionListWhere
} from "./inspection-list-query.ts";
import { createTestDatabase } from "../test-support/test-database.mjs";
import { createBaselineInspectionStorage } from "../test-support/baseline-fixture.mjs";

// The export iterator reads the ordered ids once, then the summary columns a
// batch at a time. The export streams to a client while other requests keep
// writing, so every batch must re-apply the filter: a row that moved out of the
// caller's projects (or stopped matching the filter) between the first and a
// later batch must not be exported with its new content.

const PROJECT_A = "project-hd-lng";
const PROJECT_B = "project-cssc-series";

function createDb() {
  return createTestDatabase(createBaselineInspectionStorage());
}

/** 3 items in project A, planned on 2026-11-01, plus one more per batch of extra noise. */
async function seedItems(db, count = 5) {
  const now = "2026-11-01T00:00:00.000Z";
  db.sqlite.exec("BEGIN");
  try {
    const item = db.sqlite.prepare(
      `INSERT INTO inspection_items (id, shipId, itemName, itemNameNormalized, discipline, workflowStatus, currentRound, openCommentsCount, version, source, createdAt, updatedAt)
       VALUES (?, 'ship-h2748', ?, ?, 'PAINT', 'pending', 1, 0, 1, 'manual', ?, ?)`
    );
    const round = db.sqlite.prepare(
      `INSERT INTO inspection_rounds (id, inspectionItemId, roundNumber, rawItemName, plannedDate, source, createdAt, updatedAt)
       VALUES (?, ?, 1, ?, '2026-11-01', 'manual', ?, ?)`
    );
    for (let index = 0; index < count; index += 1) {
      const id = `scope-${String(index).padStart(3, "0")}`;
      const name = `Scoped Item ${String(index).padStart(3, "0")}`;
      item.run(id, name, name.toLowerCase(), now, now);
      round.run(`${id}-r1`, id, name, now, now);
    }
    db.sqlite.exec("COMMIT");
  } catch (error) {
    db.sqlite.exec("ROLLBACK");
    throw error;
  }
}

const filterForA = {
  allowedProjectIds: [PROJECT_A],
  projectId: PROJECT_A,
  mode: "date",
  date: "2026-11-01"
};

// The baseline fixture also has insp-002 in project A on today's date; the
// assertions below are about the rows this test seeds.
const scopeIds = (rows) => rows.map((row) => row.id).filter((id) => id.startsWith("scope-"));

async function collect(iterator) {
  const batches = [];
  for await (const batch of iterator) batches.push(batch);
  return batches;
}

test("export re-applies project scope to every batch: a row moved to a foreign project after the first batch is not exported", async () => {
  const db = createDb();
  await seedItems(db, 5);

  const iterator = iterateInspectionList(db, filterForA, 4);
  const first = await iterator.next();
  assert.equal(first.value.length, 4, "first batch has the first four rows (fixture insp-002 + scope-000..002)");
  const movedId = "scope-004"; // still queued for the second batch
  assert.ok(!first.value.some((row) => row.id === movedId));

  // Another request moves a queued item to a project this caller cannot see
  // and edits its content, exactly as the item update route allows.
  await db
    .prepare("UPDATE inspection_items SET shipId = ?, itemName = ? WHERE id = ?")
    .bind("ship-h2751", "PRIVATE PROJECT B CONTENT", movedId)
    .run();

  const rest = [];
  for await (const batch of iterator) rest.push(...batch);

  assert.ok(!rest.some((row) => row.id === movedId), "an item moved out of scope is not exported");
  assert.ok(
    !JSON.stringify(rest).includes("PRIVATE PROJECT B CONTENT"),
    "the foreign project's content never reaches the export"
  );
  assert.ok(rest.every((row) => row.projectCode === "P-001"), "only rows still in scope are exported");
  // rows that stayed in scope are still exported, in the original order
  assert.deepEqual(scopeIds(rest), ["scope-003"]);
  db.close();
});

test("export re-applies the keyword/date filter to every batch: a row that stopped matching is dropped", async () => {
  const db = createDb();
  await seedItems(db, 5);

  const filter = {
    allowedProjectIds: [PROJECT_A],
    projectId: PROJECT_A,
    mode: "date",
    date: "",
    keyword: "scoped item"
  };
  const iterator = iterateInspectionList(db, filter, 2);
  const first = await iterator.next();
  const firstIds = first.value.map((row) => row.id);
  assert.deepEqual(firstIds, ["scope-000", "scope-001"]);

  // A queued row is renamed so it no longer matches the keyword.
  const renamedId = "scope-002";
  await db
    .prepare("UPDATE inspection_items SET itemName = ? WHERE id = ?")
    .bind("Renamed away from the filter", renamedId)
    .run();

  const rest = [];
  for await (const batch of iterator) rest.push(...batch);
  assert.ok(!rest.some((row) => row.id === renamedId), "a row that no longer matches the filter is not exported");
  assert.deepEqual(rest.map((row) => row.id), ["scope-003", "scope-004"]);
  db.close();
});

test("export re-applies the round date filter: a row whose planned date changed out of the range is dropped", async () => {
  const db = createDb();
  await seedItems(db, 4);

  const iterator = iterateInspectionList(db, filterForA, 4);
  const first = await iterator.next();
  assert.equal(first.value.length, 4);
  const movedId = "scope-003";
  await db
    .prepare("UPDATE inspection_rounds SET plannedDate = ? WHERE id = ?")
    .bind("2026-11-02", `${movedId}-r1`)
    .run();

  const rest = [];
  for await (const batch of iterator) rest.push(...batch);
  assert.ok(!rest.some((row) => row.id === movedId));
  assert.deepEqual(scopeIds(rest), []);
  db.close();
});

test("export still returns every matching row when nothing changes", async () => {
  const db = createDb();
  await seedItems(db, 7);
  const expected = (await queryInspectionListPage(db, filterForA, { page: 1, pageSize: 200 })).items.map((row) => row.id);
  const batches = await collect(iterateInspectionList(db, filterForA, 3));
  assert.deepEqual(batches.map((batch) => batch.length), [3, 3, 2]);
  assert.deepEqual(batches.flat().map((row) => row.id), expected);
  db.close();
});

test("a caller with no visible project still exports nothing", async () => {
  const db = createDb();
  await seedItems(db, 2);
  const batches = await collect(iterateInspectionList(db, { allowedProjectIds: [], projectId: null, mode: "date", date: "" }));
  assert.deepEqual(batches, []);
  db.close();
});

test("the where builder keeps the project scope params in step with the chunk params", () => {
  const where = buildInspectionListWhere(filterForA);
  assert.ok(where);
  assert.equal(where.params[0], PROJECT_A);
  // the batch query binds chunk ids first, then these params: the placeholders
  // of `where.sql` must therefore come after the chunk's.
  assert.match(where.sql, /^WHERE ship\."projectId" IN \(\?\) AND round\."plannedDate" = \?$/);
});
