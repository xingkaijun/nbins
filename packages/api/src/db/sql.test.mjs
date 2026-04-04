import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapD1Schema } from "./bootstrap.ts";
import { createTableStatements } from "./sql.ts";

test("createTableStatements emits one CREATE TABLE statement per schema table", () => {
  assert.equal(createTableStatements.length, 8);
  assert.match(createTableStatements[0], /CREATE TABLE IF NOT EXISTS "users"/);
  assert.match(createTableStatements[1], /CREATE TABLE IF NOT EXISTS "projects"/);
  assert.match(createTableStatements[5], /CREATE TABLE IF NOT EXISTS "comments"/);
});

test("createTableStatements preserves defaults and foreign keys needed by the mock model", () => {
  const usersTable = createTableStatements[0];
  const inspectionItemsTable = createTableStatements[3];
  const commentsTable = createTableStatements[5];

  assert.match(usersTable, /"disciplines" TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(usersTable, /"isActive" INTEGER NOT NULL DEFAULT 1/);
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
