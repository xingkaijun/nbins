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
    if (sql.includes('FROM "inspection_items" AS item')) {
      const item = this.tables.inspection_items.find((record) => record.id === params[0]);

      if (!item) {
        return [];
      }

      const ship = this.tables.ships.find((record) => record.id === item.shipId);
      const project = ship
        ? this.tables.projects.find((record) => record.id === ship.projectId)
        : null;

      if (!ship || !project) {
        throw new Error(`Missing joined rows for inspection item ${params[0]}`);
      }

      return [
        {
          item_id: item.id,
          item_shipId: item.shipId,
          item_itemName: item.itemName,
          item_itemNameNormalized: item.itemNameNormalized,
          item_discipline: item.discipline,
          item_workflowStatus: item.workflowStatus,
          item_lastRoundResult: item.lastRoundResult,
          item_resolvedResult: item.resolvedResult,
          item_currentRound: item.currentRound,
          item_openCommentsCount: item.openCommentsCount,
          item_version: item.version,
          item_source: item.source,
          item_createdAt: item.createdAt,
          item_updatedAt: item.updatedAt,
          ship_id: ship.id,
          ship_projectId: ship.projectId,
          ship_hullNumber: ship.hullNumber,
          ship_shipName: ship.shipName,
          ship_shipType: ship.shipType,
          ship_status: ship.status,
          ship_createdAt: ship.createdAt,
          ship_updatedAt: ship.updatedAt,
          project_id: project.id,
          project_name: project.name,
          project_code: project.code,
          project_status: project.status,
          project_recipients: project.recipients,
          project_createdAt: project.createdAt,
          project_updatedAt: project.updatedAt
        }
      ];
    }

    const countMatch = sql.match(/SELECT COUNT\(\*\) AS "count" FROM "([^"]+)"/);

    if (countMatch) {
      const [, tableName] = countMatch;
      const rows = [...this.tables[tableName]];
      return [{ count: this.#filterRows(sql, params, rows).length }];
    }

    const [, tableName] = sql.match(/FROM "([^"]+)"/) ?? [];
    const rows = [...this.tables[tableName]];
    return this.#filterRows(sql, params, rows);
  }

  #filterRows(sql, params, rows) {
    const inMatch = sql.match(/WHERE "([^"]+)" IN \(([^)]+)\)/);

    if (inMatch) {
      const [, column] = inMatch;
      return rows.filter((row) => params.includes(row[column]));
    }

    const whereMatches = [...sql.matchAll(/"([^"]+)" = \?/g)];

    if (whereMatches.length === 0) {
      return rows;
    }

    return rows.filter((row) =>
      whereMatches.every((match, index) => row[match[1]] === params[index])
    );
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
      'SELECT * FROM "users" WHERE "id" IN (?)'
    ]
  );
  assert.equal(
    db.executedSql.filter((sql) => sql.startsWith('SELECT * FROM "users"')).length,
    1
  );
  assert.equal(
    db.executedSql.includes('SELECT * FROM "users" WHERE "id" = ?'),
    false
  );
  assert.equal(
    db.executedSql.some((sql) => /^SELECT \* FROM "(users|projects|ships|inspection_items|inspection_rounds|comments)"$/.test(sql)),
    false
  );
});

test("D1InspectionStorage readInspectionDetail returns empty users without issuing user query", async () => {
  const db = new FakeD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  baseline.inspectionRounds = baseline.inspectionRounds.map((round) =>
    round.inspectionItemId === "insp-003" ? { ...round, inspectedBy: null } : round
  );
  baseline.comments = baseline.comments.filter((comment) => comment.inspectionItemId !== "insp-003");

  await storage.write(baseline);
  db.executedSql = [];

  const detail = await storage.readInspectionDetail("insp-003");

  assert.deepEqual(detail?.users, []);
  assert.equal(
    db.executedSql.some((sql) => sql.startsWith('SELECT * FROM "users"')),
    false
  );
});

test("D1InspectionStorage readSubmissionContext selects only item-scoped records", async () => {
  const db = new FakeD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  db.executedSql = [];

  const context = await storage.readSubmissionContext("insp-003");

  assert.equal(context?.item.id, "insp-003");
  assert.equal(context?.currentRound.id, "round-insp-003-r2");
  assert.equal(context?.openCommentCount, 1);
  assert.deepEqual(db.executedSql, [
    'SELECT * FROM "inspection_items" WHERE "id" = ?',
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ? AND "roundNumber" = ?',
    'SELECT COUNT(*) AS "count" FROM "comments" WHERE "inspectionItemId" = ? AND "status" = ?'
  ]);
  assert.equal(
    db.executedSql.some((sql) =>
      /^SELECT \* FROM "(users|projects|ships|inspection_items|inspection_rounds|comments)"$/.test(sql)
    ),
    false
  );
  assert.equal(
    db.executedSql.includes('SELECT * FROM "comments"'),
    false
  );
});

test("D1InspectionStorage readSubmittedInspectionDetail narrows the post-submit summary read", async () => {
  const db = new FakeD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  db.executedSql = [];

  const detail = await storage.readSubmittedInspectionDetail("insp-003");

  assert.equal(detail?.item.id, "insp-003");
  assert.equal(detail?.project.code, "P-002");
  assert.deepEqual(db.executedSql, [
    `SELECT
         item."id" AS "item_id",
         item."shipId" AS "item_shipId",
         item."itemName" AS "item_itemName",
         item."itemNameNormalized" AS "item_itemNameNormalized",
         item."discipline" AS "item_discipline",
         item."workflowStatus" AS "item_workflowStatus",
         item."lastRoundResult" AS "item_lastRoundResult",
         item."resolvedResult" AS "item_resolvedResult",
         item."currentRound" AS "item_currentRound",
         item."openCommentsCount" AS "item_openCommentsCount",
         item."version" AS "item_version",
         item."source" AS "item_source",
         item."createdAt" AS "item_createdAt",
         item."updatedAt" AS "item_updatedAt",
         ship."id" AS "ship_id",
         ship."projectId" AS "ship_projectId",
         ship."hullNumber" AS "ship_hullNumber",
         ship."shipName" AS "ship_shipName",
         ship."shipType" AS "ship_shipType",
         ship."status" AS "ship_status",
         ship."createdAt" AS "ship_createdAt",
         ship."updatedAt" AS "ship_updatedAt",
         project."id" AS "project_id",
         project."name" AS "project_name",
         project."code" AS "project_code",
         project."status" AS "project_status",
         project."recipients" AS "project_recipients",
         project."createdAt" AS "project_createdAt",
         project."updatedAt" AS "project_updatedAt"
       FROM "inspection_items" AS item
       INNER JOIN "ships" AS ship ON ship."id" = item."shipId"
       INNER JOIN "projects" AS project ON project."id" = ship."projectId"
       WHERE item."id" = ?`,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "comments" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "users" WHERE "id" IN (?)'
  ]);
});
