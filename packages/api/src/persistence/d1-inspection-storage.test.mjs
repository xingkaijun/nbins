import test from "node:test";
import assert from "node:assert/strict";
import { D1InspectionStorage } from "./d1-inspection-storage.ts";
import {
  INSPECTION_DETAIL_SUMMARY_SQL,
  INSPECTION_LIST_SUMMARY_SQL
} from "./d1-inspection-sql.ts";
import { createBaselineInspectionStorage } from "../test-support/baseline-fixture.mjs";
import { SqliteD1Database } from "../test-support/sqlite-d1.mjs";

function assertUsesSingleJoinedDetailSummaryQuery(executedSql) {
  assert.equal(
    executedSql.filter((sql) => sql === INSPECTION_DETAIL_SUMMARY_SQL).length,
    1
  );
  assert.equal(
    executedSql.some((sql) =>
      [
        'SELECT * FROM "inspection_items" WHERE "id" = ?',
        'SELECT * FROM "ships" WHERE "id" = ?',
        'SELECT * FROM "projects" WHERE "id" = ?'
      ].includes(sql)
    ),
    false
  );
}

function assertUsesSingleJoinedListSummaryQuery(executedSql) {
  assert.equal(
    executedSql.filter((sql) => sql === INSPECTION_LIST_SUMMARY_SQL).length,
    1
  );
  assert.equal(
    executedSql.some((sql) =>
      [
        'SELECT * FROM "inspection_items"',
        'SELECT * FROM "ships" WHERE "id" IN (?, ?)',
        'SELECT * FROM "projects" WHERE "id" IN (?, ?)',
        'SELECT * FROM "ships" WHERE "id" = ?',
        'SELECT * FROM "projects" WHERE "id" = ?'
      ].includes(sql)
    ),
    false
  );
}

test("D1InspectionStorage reads and writes repository snapshots", async () => {
  const db = new SqliteD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  const snapshot = await storage.read();

  assert.deepEqual(snapshot, baseline);
});

test("D1InspectionStorage readProjectMembersByUserId uses a narrow membership query", async () => {
  const db = new SqliteD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  db.executedSql = [];

  const memberships = await storage.readProjectMembersByUserId("user-inspector-li");

  assert.deepEqual(memberships.map((record) => record.projectId), ["project-hd-lng"]);
  assert.deepEqual(db.executedSql, ['SELECT * FROM "project_members" WHERE "userId" = ?']);
  assert.equal(
    db.executedSql.some((sql) =>
      [
        'SELECT * FROM "project_members"',
        'SELECT * FROM "projects" WHERE "id" = ?',
        'SELECT * FROM "users" WHERE "id" = ?'
      ].includes(sql)
    ),
    false
  );
});

test("D1InspectionStorage submitCurrentRoundResult updates only affected tables", async () => {
  const db = new SqliteD1Database();
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
        localId: 2,
        content: "Monitor one repaired weld during close-out.",
        status: "open",
        closedBy: null,
        closedAt: null,
        resolveRemark: null,
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
  const db = new SqliteD1Database();
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
      INSPECTION_DETAIL_SUMMARY_SQL,
      'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
      'SELECT * FROM "comments" WHERE "inspectionItemId" = ?',
      'SELECT * FROM "users" WHERE "id" IN (?)'
    ]
  );
  assertUsesSingleJoinedDetailSummaryQuery(db.executedSql);
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
  const db = new SqliteD1Database();
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
  assertUsesSingleJoinedDetailSummaryQuery(db.executedSql);
  assert.equal(
    db.executedSql.some((sql) => sql.startsWith('SELECT * FROM "users"')),
    false
  );
});

test("D1InspectionStorage readInspectionList uses a single joined summary query", async () => {
  const db = new SqliteD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  db.executedSql = [];

  const list = await storage.readInspectionList();

  assert.equal(list.items.length, 2);
  assert.deepEqual(db.executedSql, [
    INSPECTION_LIST_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" IN (?, ?)'
  ]);
  assertUsesSingleJoinedListSummaryQuery(db.executedSql);
});

test("D1InspectionStorage readSubmissionContext selects only item-scoped records", async () => {
  const db = new SqliteD1Database();
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
  const db = new SqliteD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  db.executedSql = [];

  const detail = await storage.readSubmittedInspectionDetail("insp-003");

  assert.equal(detail?.item.id, "insp-003");
  assert.equal(detail?.project.code, "P-002");
  assert.deepEqual(db.executedSql, [
    INSPECTION_DETAIL_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "comments" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "users" WHERE "id" IN (?)'
  ]);
  assertUsesSingleJoinedDetailSummaryQuery(db.executedSql);
});
