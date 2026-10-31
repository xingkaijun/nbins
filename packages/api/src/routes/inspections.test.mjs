import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../index.ts";
import { issueAccessToken } from "../auth/jwt.ts";
import {
  INSPECTION_DETAIL_SUMMARY_SQL,
  INSPECTION_LIST_SUMMARY_SQL
} from "../persistence/d1-inspection-sql.ts";
import { createBaselineInspectionStorage } from "../test-support/baseline-fixture.mjs";
import { TestSqliteDatabase, createTestEnv } from "../test-support/test-database.mjs";

// Every request runs on the real D1 storage over an in-memory SQLite with the
// real schema (../test-support/test-database.mjs), seeded with the baseline fixture
// these tests were written against. The mock storage driver they used to fall
// back to was removed in commit 84b37ac. Like the old per-app mock, state lives
// as long as the app object, so sequential requests on one app see each other.
const SEED_GATE_SQL = "SELECT COUNT(*) as cnt FROM users";

function createTestApp() {
  const app = createApp();
  const env = createTestEnv(createBaselineInspectionStorage());

  return {
    env,
    request(input, init, requestEnv) {
      return app.request(input, init, requestEnv ?? env);
    }
  };
}

const LI_SI = { username: "li.si", password: "nbins-dev-li-2026" };
// wang.wu is the member of project-cssc-series with the CCS discipline, i.e. the
// inspector the API allows to write insp-003 (membership + discipline checks
// in routes/inspections.ts).
const WANG_WU = { username: "wang.wu", password: "nbins-dev-wang-2026" };

async function loginAndCreateAuthHeader(app, env, credentials = LI_SI) {
  const response = await app.request(
    "http://localhost/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials)
    },
    env
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);

  return { authorization: `Bearer ${payload.data.token}` };
}

async function createAuthHeaderForUser(claims, env = {}) {
  return {
    authorization: `Bearer ${await issueAccessToken(claims, env)}`
  };
}

/** Adds insp-001 (PAINT, ship H-2748 in project-hd-lng) next to insp-002. */
function withSecondHdLngItem(seed) {
  seed.inspectionItems.push({
    id: "insp-001",
    shipId: "ship-h2748",
    itemName: "Ballast Tank Coating Inspection",
    itemNameNormalized: "ballast tank coating inspection",
    discipline: "PAINT",
    workflowStatus: "pending",
    lastRoundResult: null,
    resolvedResult: null,
    currentRound: 1,
    openCommentsCount: 0,
    version: 1,
    source: "manual",
    createdAt: "2026-04-02T09:00:00.000Z",
    updatedAt: "2026-04-02T09:00:00.000Z"
  });
  seed.inspectionRounds.push({
    id: "round-insp-001-r1",
    inspectionItemId: "insp-001",
    roundNumber: 1,
    rawItemName: "Ballast Tank Coating Inspection",
    plannedDate: "2026-04-05",
    actualDate: null,
    yardQc: "Li Si",
    result: null,
    inspectedBy: null,
    notes: null,
    source: "manual",
    createdAt: "2026-04-02T09:00:00.000Z",
    updatedAt: "2026-04-02T09:00:00.000Z"
  });
  return seed;
}

function seedFakeD1Database(db, seed = createBaselineInspectionStorage()) {
  db.seed(seed);
}

test("GET /api/inspections returns 401 without bearer token", async () => {
  const app = createTestApp();
  const response = await app.request("http://localhost/api/inspections");
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Authorization header must use Bearer token");
});

test("GET /api/inspections returns inspection list snapshot", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request("http://localhost/api/inspections", { headers });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(Array.isArray(payload.data.items), true);
  assert.equal(payload.data.items.length, 1);
  assert.equal(payload.data.items[0].id, "insp-002");
  assert.equal(payload.data.items[0].currentResult, "QCC");
  assert.equal(payload.data.summary.openComments, 2);
});

test("GET /api/inspections/:id returns inspection detail", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request("http://localhost/api/inspections/insp-002", { headers });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.id, "insp-002");
  assert.equal(payload.data.lastRoundResult, "QCC");
  assert.equal(payload.data.openCommentCount, 2);
  assert.equal(payload.data.comments[0].status, "open");
});

test("GET /api/inspections/:id returns 404 when the item is outside project membership", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request("http://localhost/api/inspections/insp-003", { headers });
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item not found");
});

test("GET /api/inspections/:id returns 401 without bearer token", async () => {
  const app = createTestApp();
  const response = await app.request("http://localhost/api/inspections/insp-002");
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Authorization header must use Bearer token");
});

test("GET /api/inspections/:id serves the seeded item through the D1 driver", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request("http://localhost/api/inspections/insp-002", { headers });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.id, "insp-002");
  assert.equal(payload.data.version, 3);
});

test("D1 storage preserves writes across sequential requests", async () => {
  const app = createTestApp();
  const headers = await createAuthHeaderForUser({
    id: "user-inspector-wang",
    role: "inspector",
    disciplines: ["CCS", "HULL"]
  });

  const submitResponse = await app.request(
    "http://localhost/api/inspections/insp-003/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        result: "CX",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:15:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Wang Wu",
        expectedVersion: 5,
        comments: []
      })
    }
  );

  assert.equal(submitResponse.status, 200);

  const getResponse = await app.request("http://localhost/api/inspections/insp-003", { headers });
  const payload = await getResponse.json();

  assert.equal(getResponse.status, 200);
  assert.equal(payload.data.workflowStatus, "cancelled");
  assert.equal(payload.data.version, 6);
});

test("GET /api/inspections/:id returns 404 for unknown inspection items", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request("http://localhost/api/inspections/insp-missing", { headers });
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item not found");
});

test("PUT /api/inspections/:id/rounds/current/result returns 401 without bearer token", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-003/rounds/current/result",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:00:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Wang Wu",
        expectedVersion: 5,
        comments: []
      })
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Authorization header must use Bearer token");
});

test("PUT /api/inspections/:id/rounds/current/result accepts QCC with comments", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app, undefined, WANG_WU);
  const response = await app.request(
    "http://localhost/api/inspections/insp-003/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:00:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Wang Wu",
        notes: "Accepted with tracking comments.",
        expectedVersion: 5,
        comments: [{ message: "Monitor one repaired weld during close-out." }]
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.item.lastRoundResult, "QCC");
  assert.equal(payload.data.item.workflowStatus, "open");
  assert.equal(payload.data.item.waitingForNextRound, false);
  assert.equal(payload.data.item.openCommentCount, 2);
  assert.equal(payload.data.item.version, 6);
});

test("PUT /api/inspections/:id/rounds/current/result uses narrow D1 writes", async () => {
  const app = createApp();
  const db = new TestSqliteDatabase();
  seedFakeD1Database(db);

  db.deletedTables = [];
  db.updatedTables = [];
  db.insertedTables = [];
  db.executedSql = [];
  const headers = await loginAndCreateAuthHeader(app, {
    DB: db
  }, WANG_WU);
  db.executedSql = [];

  const response = await app.request(
    "http://localhost/api/inspections/insp-003/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:00:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Wang Wu",
        notes: "Accepted with tracking comments.",
        expectedVersion: 5,
        comments: [{ message: "Monitor one repaired weld during close-out." }]
      })
    },
    {
      DB: db
    }
  );

  const payload = await response.json();
  if (response.status !== 200) console.log("FAILED_PAYLOAD", payload);

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.deepEqual(db.deletedTables, []);
  assert.deepEqual(db.updatedTables, ["inspection_rounds", "inspection_items"]);
  assert.deepEqual(db.insertedTables, ["comments"]);
  // 1) Authorization: user by id, then the membership gate (project_members +
  //    one narrow detail read of the target item, routes/inspections.ts). Each
  //    storage resolve runs the seed gate COUNT (d1-seeded-inspection-storage.ts).
  const writeStart = db.executedSql.indexOf('SELECT * FROM "inspection_items" WHERE "id" = ?');
  assert.deepEqual(db.executedSql.slice(0, writeStart), [
    SEED_GATE_SQL,
    'SELECT * FROM "users" WHERE "id" = ?',
    SEED_GATE_SQL,
    'SELECT * FROM "project_members" WHERE "userId" = ?',
    SEED_GATE_SQL,
    INSPECTION_DETAIL_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "comments" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "users" WHERE "id" IN (?)'
  ]);
  // 2) The write itself: only narrow reads of the affected item, then the reload.
  assert.deepEqual(db.executedSql.slice(writeStart, writeStart + 6), [
    'SELECT * FROM "inspection_items" WHERE "id" = ?',
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ? AND "roundNumber" = ?',
    'SELECT COUNT(*) AS "count" FROM "comments" WHERE "inspectionItemId" = ? AND "status" = ?',
    INSPECTION_DETAIL_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "comments" WHERE "inspectionItemId" = ?'
  ]);
  assert.equal(db.executedSql[writeStart + 6], 'SELECT * FROM "users" WHERE "id" IN (?)');
  assert.equal(
    db.executedSql.some((sql) =>
      /^SELECT \* FROM "(users|projects|ships|inspection_items|inspection_rounds|comments)"$/.test(sql)
    ),
    false
  );
  assert.equal(
    db.executedSql.some((sql) => sql === 'SELECT * FROM "comments"'),
    false
  );
  assert.equal(
    db.executedSql.some((sql) => sql === 'SELECT * FROM "inspection_rounds"'),
    false
  );
  assert.equal(
    db.tables.inspection_items.find((record) => record.id === "insp-003").version,
    6
  );
  assert.equal(
    db.tables.inspection_rounds.find((record) => record.id === "round-insp-003-r2").result,
    "QCC"
  );
});

test("GET /api/inspections/:id uses narrow D1 reads", async () => {
  const app = createApp();
  const db = new TestSqliteDatabase();
  seedFakeD1Database(db);

  db.executedSql = [];
  const headers = await loginAndCreateAuthHeader(app, {
    DB: db
  });
  db.executedSql = [];

  const response = await app.request("http://localhost/api/inspections/insp-002", { headers }, {
    DB: db
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.id, "insp-002");
  assert.equal(
    db.executedSql.some((sql) => /^SELECT \* FROM "(users|projects|ships|inspection_items|inspection_rounds|comments)"$/.test(sql)),
    false
  );
  assert.deepEqual(
    db.executedSql,
    [
      SEED_GATE_SQL,
      'SELECT * FROM "users" WHERE "id" = ?',
      SEED_GATE_SQL,
      'SELECT * FROM "project_members" WHERE "userId" = ?',
      INSPECTION_DETAIL_SUMMARY_SQL,
      'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
      'SELECT * FROM "comments" WHERE "inspectionItemId" = ?',
      'SELECT * FROM "users" WHERE "id" IN (?)'
    ]
  );
  assert.equal(
    db.executedSql.filter((sql) => sql.startsWith('SELECT * FROM "users"')).length,
    2
  );
  assert.equal(
    db.executedSql.filter((sql) => sql === 'SELECT * FROM "users" WHERE "id" = ?').length,
    1
  );
});

test("GET /api/inspections uses narrow D1 reads", async () => {
  const app = createApp();
  const db = new TestSqliteDatabase();
  // Second item in li.si's project so ordering and project filtering are both visible.
  seedFakeD1Database(db, withSecondHdLngItem(createBaselineInspectionStorage()));

  db.executedSql = [];
  const headers = await loginAndCreateAuthHeader(app, {
    DB: db
  });
  db.executedSql = [];

  const response = await app.request("http://localhost/api/inspections", { headers }, {
    DB: db
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.items.length, 2);
  assert.equal(payload.data.items[0].id, "insp-002");
  assert.equal(payload.data.items[1].id, "insp-001");
  assert.equal(
    db.executedSql.some((sql) =>
      /^SELECT \* FROM "(users|projects|ships|inspection_rounds|comments)"$/.test(sql)
    ),
    false
  );
  // Rounds are fetched for every item the list SQL returns (3 seeded items);
  // project filtering then happens in the repository.
  assert.deepEqual(db.executedSql, [
    SEED_GATE_SQL,
    'SELECT * FROM "users" WHERE "id" = ?',
    SEED_GATE_SQL,
    'SELECT * FROM "project_members" WHERE "userId" = ?',
    INSPECTION_LIST_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" IN (?, ?, ?)'
  ]);
  assert.equal(db.executedSql.filter((sql) => sql === INSPECTION_LIST_SUMMARY_SQL).length, 1);
  assert.equal(
    db.executedSql.some((sql) =>
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
});

test("GET /api/inspections/:id returns 404 in D1 when the item is outside project membership", async () => {
  const app = createApp();
  const db = new TestSqliteDatabase();
  seedFakeD1Database(db);

  db.executedSql = [];
  const headers = await loginAndCreateAuthHeader(app, {
    DB: db
  });
  db.executedSql = [];

  const response = await app.request("http://localhost/api/inspections/insp-003", { headers }, {
    DB: db
  });
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item not found");
  assert.deepEqual(db.executedSql, [
    SEED_GATE_SQL,
    'SELECT * FROM "users" WHERE "id" = ?',
    SEED_GATE_SQL,
    'SELECT * FROM "project_members" WHERE "userId" = ?',
    INSPECTION_DETAIL_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "comments" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "users" WHERE "id" IN (?)'
  ]);
});

test("GET /api/inspections returns an empty list when the user has no project memberships", async () => {
  const app = createApp();
  const db = new TestSqliteDatabase();
  const seed = createBaselineInspectionStorage();
  seed.users.push({
    id: "user-no-membership",
    username: "no.membership",
    displayName: "No Membership",
    passwordHash: "disabled",
    role: "inspector",
    disciplines: [],
    accessibleProjectIds: [],
    isActive: 1,
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:00.000Z"
  });
  seedFakeD1Database(db, seed);

  db.executedSql = [];
  const headers = await createAuthHeaderForUser(
    {
      id: "user-no-membership",
      role: "inspector",
      disciplines: []
    },
    {
      DB: db
    }
  );
  db.executedSql = [];

  const response = await app.request("http://localhost/api/inspections", { headers }, {
    DB: db
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.data.items, []);
  assert.equal(payload.data.summary.openComments, 0);
  // Membership is now read once per request (it used to be read twice).
  assert.deepEqual(db.executedSql, [
    SEED_GATE_SQL,
    'SELECT * FROM "users" WHERE "id" = ?',
    SEED_GATE_SQL,
    'SELECT * FROM "project_members" WHERE "userId" = ?',
    INSPECTION_LIST_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" IN (?, ?)'
  ]);
});

test("GET /api/inspections/:id returns 404 when the user has no project memberships", async () => {
  const app = createApp();
  const db = new TestSqliteDatabase();
  const seed = createBaselineInspectionStorage();
  seed.users.push({
    id: "user-no-membership",
    username: "no.membership",
    displayName: "No Membership",
    passwordHash: "disabled",
    role: "inspector",
    disciplines: [],
    accessibleProjectIds: [],
    isActive: 1,
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:00.000Z"
  });
  seedFakeD1Database(db, seed);

  db.executedSql = [];
  const headers = await createAuthHeaderForUser(
    {
      id: "user-no-membership",
      role: "inspector",
      disciplines: []
    },
    {
      DB: db
    }
  );
  db.executedSql = [];

  const response = await app.request("http://localhost/api/inspections/insp-002", { headers }, {
    DB: db
  });
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item not found");
  // Membership is now read once per request (it used to be read twice).
  assert.deepEqual(db.executedSql, [
    SEED_GATE_SQL,
    'SELECT * FROM "users" WHERE "id" = ?',
    SEED_GATE_SQL,
    'SELECT * FROM "project_members" WHERE "userId" = ?',
    INSPECTION_DETAIL_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "comments" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "users" WHERE "id" IN (?)'
  ]);
});

test("PUT /api/inspections/:id/rounds/current/result accepts CX without adding comments", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app, undefined, WANG_WU);
  const response = await app.request(
    "http://localhost/api/inspections/insp-003/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        result: "CX",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:15:00.000Z",
        submittedBy: "user-inspector-wang",
        inspectorDisplayName: "Wang Wu",
        expectedVersion: 5,
        comments: []
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.item.workflowStatus, "cancelled");
  assert.equal(payload.data.item.resolvedResult, "CX");
  assert.equal(payload.data.item.openCommentCount, 1);
  assert.equal(payload.data.item.waitingForNextRound, false);
});

test("PUT /api/inspections/:id/rounds/current/result rejects AA with new comments", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        result: "AA",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T11:30:00.000Z",
        submittedBy: "user-inspector-li",
        inspectorDisplayName: "Li Si",
        expectedVersion: 3,
        comments: [{ message: "This should fail." }]
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /AA submissions cannot introduce new open comments/);
});

test("PUT /api/inspections/:id/rounds/current/result enforces optimistic locking", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T12:00:00.000Z",
        submittedBy: "user-inspector-li",
        inspectorDisplayName: "Li Si",
        expectedVersion: 1,
        comments: []
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item version conflict");
});

test("PUT /api/inspections/:id/rounds/current/result returns 400 for malformed JSON", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: "{"
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Request body must be valid JSON");
});

test("PUT /api/inspections/:id/rounds/current/result returns 400 for non-object JSON", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify("not-an-object")
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Request body must be an object");
});

test("PUT /api/inspections/:id/rounds/current/result returns 400 for invalid request fields", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T12:00:00.000Z",
        submittedBy: "   ",
        inspectorDisplayName: "Li Si",
        expectedVersion: 3,
        comments: [{ message: "Open one more tracking item" }]
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /submittedBy is required/);
});

test("PUT /api/inspections/:id/rounds/current/result returns 404 for unknown inspection items", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request(
    "http://localhost/api/inspections/insp-missing/rounds/current/result",
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        result: "QCC",
        actualDate: "2026-04-03",
        submittedAt: "2026-04-03T12:15:00.000Z",
        submittedBy: "user-inspector-li",
        inspectorDisplayName: "Li Si",
        expectedVersion: 1,
        comments: []
      })
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Inspection item not found");
});

test("PUT /api/inspections/:id/comments/:commentId/resolve resolves a comment and updates inspection status", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  
  // 1. 获取初始状态
  const initialResponse = await app.request("http://localhost/api/inspections/insp-002", { headers });
  const initialPayload = await initialResponse.json();
  const targetComment = initialPayload.data.comments.find(c => c.status === "open");
  const initialVersion = initialPayload.data.version;

  assert.ok(targetComment, "Should find an open comment to resolve");

  // 2. 执行关闭操作
  const resolveResponse = await app.request(
    `http://localhost/api/inspections/insp-002/comments/${targetComment.id}/resolve`,
    {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        resolvedBy: "user-inspector-li",
        expectedVersion: initialVersion
      })
    }
  );
  const resolvePayload = await resolveResponse.json();

  assert.equal(resolveResponse.status, 200);
  assert.equal(resolvePayload.ok, true);
  // The resolve endpoint answers with ResolveCommentResponse = { item: InspectionItemDetailResponse }
  // (packages/shared/src/inspection-detail.ts), so the updated detail is under data.item.
  assert.equal(typeof initialPayload.data.openCommentCount, "number");
  assert.equal(resolvePayload.data.item.openCommentCount, initialPayload.data.openCommentCount - 1);

  // 3. 验证持久化状态
  const finalResponse = await app.request("http://localhost/api/inspections/insp-002", { headers });
  const finalPayload = await finalResponse.json();
  const resolvedComment = finalPayload.data.comments.find(c => c.id === targetComment.id);

  assert.equal(resolvedComment.status, "closed");
  // closedBy stores the user id (FK to users); the API shows that user's display
  // name (inspection-detail-mapper.ts: closedBy?.displayName ?? record.closedBy).
  assert.equal(resolvedComment.resolvedBy, "Li Si");
  assert.equal(
    app.env.DB.tables.comments.find((record) => record.id === targetComment.id).closedBy,
    "user-inspector-li"
  );
  assert.equal(finalPayload.data.version, initialVersion + 1);
});

test("PUT /api/inspections/:id/comments/:commentId/resolve returns 401 without bearer token", async () => {
  const app = createTestApp();
  const response = await app.request(
    "http://localhost/api/inspections/insp-002/comments/any/resolve",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolvedBy: "tester", expectedVersion: 1 })
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
});
