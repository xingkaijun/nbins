import test from "node:test";
import assert from "node:assert/strict";
import { D1InspectionStorage } from "./d1-inspection-storage.ts";
import { createBaselineInspectionStorage } from "./mock-inspection-db.ts";

class FakePreparedStatement {
  #db;
  #sql;
  #params = [];

  constructor(db, sql) {
    this.#db = db;
    this.#sql = sql;
  }

  bind(...params) {
    this.#params = params;
    return this;
  }

  async all() {
    return { results: this.#db.select(this.#sql, this.#params) };
  }

  async run() {
    this.#db.execute(this.#sql, this.#params);
    return { success: true };
  }
}

class FakeD1Database {
  constructor() {
    this.tables = {
      users: [],
      projects: [],
      ships: [],
      inspection_items: [],
      inspection_rounds: [],
      comments: []
    };
    this.executedSql = [];
    this.deletedTables = [];
    this.updatedTables = [];
    this.insertedTables = [];
  }

  prepare(sql) {
    return new FakePreparedStatement(this, sql);
  }

  async batch(statements) {
    for (const statement of statements) {
      await statement.run();
    }

    return [];
  }

  select(sql, params) {
    return this.#selectInternal(sql, params);
  }

  #selectInternal(sql, params) {
    this.executedSql.push(sql);
    const [, tableName] = sql.match(/FROM "([^"]+)"/) ?? [];
    const rows = [...this.tables[tableName]];
    const whereMatch = sql.match(/WHERE "([^"]+)" = \?/);

    if (!whereMatch) {
      return rows;
    }

    const [, column] = whereMatch;
    return rows.filter((row) => row[column] === params[0]);
  }

  execute(sql, params) {
    this.executedSql.push(sql);

    const deleteMatch = sql.match(/DELETE FROM "([^"]+)"/);

    if (deleteMatch) {
      this.deletedTables.push(deleteMatch[1]);
      this.tables[deleteMatch[1]] = [];
      return;
    }

    const updateMatch = sql.match(/UPDATE "([^"]+)"\s+SET\s+(.+?)\s+WHERE "id" = \?/s);

    if (updateMatch) {
      const [, tableName, rawAssignments] = updateMatch;
      const assignments = rawAssignments
        .split(",")
        .map((assignment) => assignment.trim())
        .map((assignment) => assignment.match(/"([^"]+)"/)?.[1] ?? null);
      const id = params[params.length - 1];
      const row = this.tables[tableName].find((entry) => entry.id === id);

      if (!row) {
        throw new Error(`Missing row ${tableName}.${id}`);
      }

      assignments.forEach((column, index) => {
        row[column] = params[index];
      });
      this.updatedTables.push(tableName);
      return;
    }

    const insertMatch = sql.match(/INSERT INTO "([^"]+)" \(([^)]+)\)/);

    if (!insertMatch) {
      throw new Error(`Unsupported SQL: ${sql}`);
    }

    const [, tableName, rawColumns] = insertMatch;
    const columns = rawColumns.split(",").map((column) => column.trim().replaceAll('"', ""));
    const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
    this.tables[tableName].push(row);
    this.insertedTables.push(tableName);
  }
}

test("D1InspectionStorage reads and writes repository snapshots", async () => {
  const db = new FakeD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  const snapshot = await storage.read();

  assert.deepEqual(snapshot, baseline);
});

test("D1InspectionStorage submitCurrentRoundResult updates only affected tables", async () => {
  const db = new FakeD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  db.executedSql = [];
  db.deletedTables = [];
  db.updatedTables = [];
  db.insertedTables = [];

  await storage.submitCurrentRoundResult({
    inspectionItem: {
      ...baseline.inspectionItems.find((record) => record.id === "insp-003"),
      workflowStatus: "open",
      lastRoundResult: "QCC",
      resolvedResult: null,
      openCommentsCount: 2,
      version: 6,
      updatedAt: "2026-04-03T11:00:00.000Z"
    },
    inspectionRound: {
      ...baseline.inspectionRounds.find((record) => record.id === "round-insp-003-r2"),
      actualDate: "2026-04-03",
      result: "QCC",
      inspectedBy: "user-inspector-wang",
      notes: "Accepted with tracking comments.",
      updatedAt: "2026-04-03T11:00:00.000Z"
    },
    createdComments: [
      {
        id: "insp-003-comment-round-insp-003-r2-1",
        inspectionItemId: "insp-003",
        createdInRoundId: "round-insp-003-r2",
        closedInRoundId: null,
        authorId: "user-inspector-wang",
        content: "Monitor one repaired weld during close-out.",
        status: "open",
        closedBy: null,
        closedAt: null,
        createdAt: "2026-04-03T11:00:00.000Z",
        updatedAt: "2026-04-03T11:00:00.000Z"
      }
    ]
  });

  assert.deepEqual(db.deletedTables, []);
  assert.deepEqual(db.updatedTables, ["inspection_rounds", "inspection_items"]);
  assert.deepEqual(db.insertedTables, ["comments"]);
  assert.equal(
    db.tables.inspection_items.find((record) => record.id === "insp-003").version,
    6
  );
  assert.equal(
    db.tables.inspection_rounds.find((record) => record.id === "round-insp-003-r2").result,
    "QCC"
  );
  assert.equal(db.tables.comments.length, baseline.comments.length + 1);
});

test("D1InspectionStorage readInspectionDetail selects only item-scoped records", async () => {
  const db = new FakeD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  db.executedSql = [];

  const detail = await storage.readInspectionDetail("insp-003");

  assert.equal(detail?.item.id, "insp-003");
  assert.equal(detail?.project.code, "P-002");
  assert.deepEqual(
    db.executedSql,
    [
      'SELECT * FROM "inspection_items" WHERE "id" = ?',
      'SELECT * FROM "ships" WHERE "id" = ?',
      'SELECT * FROM "projects" WHERE "id" = ?',
      'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
      'SELECT * FROM "comments" WHERE "inspectionItemId" = ?',
      'SELECT * FROM "users" WHERE "id" = ?'
    ]
  );
  assert.equal(
    db.executedSql.some((sql) => /^SELECT \* FROM "(users|projects|ships|inspection_items|inspection_rounds|comments)"$/.test(sql)),
    false
  );
});
