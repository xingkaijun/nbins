import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapD1Schema } from "./bootstrap.ts";
import { readFileSync } from "node:fs";
import { createTableStatements } from "./sql.ts";
import { schema } from "./schema.ts";

test("createTableStatements emits one CREATE TABLE statement per schema table", () => {
  // Compare the table list, not just a count: ncrs / ncr_index were added with the
  // NCR module (commits 3ae3ee9, ca28d73) and observation_types / observations with
  // the observation module (b81d183), fat_index with the FAT module (595e3af), so
  // the old "9 tables" count was stale. fat_index was in schema.ts but missing from
  // TABLE_ORDER in sql.ts, which this list comparison caught.
  const tableNames = createTableStatements.map(
    (statement) => statement.match(/^CREATE TABLE IF NOT EXISTS "([^"]+)"/)?.[1] ?? null
  );

  assert.deepEqual(tableNames, [
    "users",
    "projects",
    "project_members",
    "ships",
    "inspection_items",
    "inspection_rounds",
    "comments",
    "ncrs",
    "ncr_index",
    "observation_types",
    "observations",
    "fat_index"
  ]);
  assert.equal(createTableStatements.length, Object.keys(schema).length);
  assert.match(createTableStatements[0], /CREATE TABLE IF NOT EXISTS "users"/);
  assert.match(createTableStatements[1], /CREATE TABLE IF NOT EXISTS "projects"/);
  assert.match(createTableStatements[2], /CREATE TABLE IF NOT EXISTS "project_members"/);
  assert.match(createTableStatements[6], /CREATE TABLE IF NOT EXISTS "comments"/);
});

test("every generated table also exists in the D1 bootstrap SQL", () => {
  const bootstrapSql = readFileSync(new URL("./d1-bootstrap.sql", import.meta.url), "utf8");

  for (const statement of createTableStatements) {
    const tableName = statement.match(/^CREATE TABLE IF NOT EXISTS "([^"]+)"/)?.[1];
    assert.match(bootstrapSql, new RegExp(`CREATE TABLE IF NOT EXISTS "${tableName}"`), tableName);
  }
});

test("createTableStatements preserves defaults and foreign keys needed by the mock model", () => {
  const usersTable = createTableStatements[0];
  const projectMembersTable = createTableStatements[2];
  const inspectionItemsTable = createTableStatements[4];
  const commentsTable = createTableStatements[6];

  assert.match(usersTable, /"disciplines" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(usersTable, /"isActive" INTEGER NOT NULL DEFAULT 1/);
  assert.match(projectMembersTable, /"projectId" TEXT NOT NULL REFERENCES "projects"\("id"\)/);
  assert.match(projectMembersTable, /"userId" TEXT NOT NULL REFERENCES "users"\("id"\)/);
  assert.match(inspectionItemsTable, /"workflowStatus" TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(
    inspectionItemsTable,
    /"shipId" TEXT NOT NULL REFERENCES "ships"\("id"\)/
  );
  assert.match(
    commentsTable,
    /"createdInRoundId" TEXT NOT NULL REFERENCES "inspection_rounds"\("id"\)/
  );
});

test("bootstrapD1Schema executes each generated statement in order", async () => {
  const executed = [];
  const db = {
    exec(statement) {
      executed.push(statement);
      return Promise.resolve();
    }
  };

  await bootstrapD1Schema(db);

  assert.deepEqual(executed, createTableStatements);
});
