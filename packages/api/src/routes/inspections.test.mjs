import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../index.ts";
import {
  INSPECTION_DETAIL_SUMMARY_SQL,
  INSPECTION_LIST_SUMMARY_SQL
} from "../persistence/d1-inspection-sql.ts";
import { createSeedInspectionStorageSnapshot } from "../persistence/seed.ts";

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
    this.executedSql.push(sql);
    if (sql.includes('FROM "inspection_items" AS item')) {
      const items =
        params.length === 0
          ? this.tables.inspection_items
          : this.tables.inspection_items.filter((record) => record.id === params[0]);

      return items.map((item) => {
        const ship = this.tables.ships.find((record) => record.id === item.shipId);
        const project = ship
          ? this.tables.projects.find((record) => record.id === ship.projectId)
          : null;

        if (!ship || !project) {
          throw new Error(`Missing joined rows for inspection item ${item.id}`);
        }

        return {
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
          project_owner: project.owner,
          project_shipyard: project.shipyard,
          project_class: project.class,
          project_recipients: project.recipients,
          project_createdAt: project.createdAt,
          project_updatedAt: project.updatedAt
        };
      });
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

function createTestApp() {
  return createApp();
}

async function loginAndCreateAuthHeader(app, env = {}) {
  const response = await app.request(
    "http://localhost/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "li.si",
        password: "nbins-dev-li-2026"
      })
    },
    env
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);

  return { authorization: `Bearer ${payload.data.token}` };
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
  assert.equal(payload.data.items.length, 2);
  assert.equal(payload.data.items[0].id, "insp-002");
  assert.equal(payload.data.items[1].id, "insp-003");
  assert.equal(payload.data.items[1].currentResult, "OWC");
  assert.equal(payload.data.summary.openComments, 3);
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

test("GET /api/inspections/:id returns 401 without bearer token", async () => {
  const app = createTestApp();
  const response = await app.request("http://localhost/api/inspections/insp-002");
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Authorization header must use Bearer token");
});

test("GET /api/inspections/:id keeps mock as the default runtime driver", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
  const response = await app.request("http://localhost/api/inspections/insp-003", { headers });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.id, "insp-003");
  assert.equal(payload.data.version, 5);
});

test("default mock driver preserves writes across sequential requests", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);

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
  const headers = await loginAndCreateAuthHeader(app);
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
  const db = new FakeD1Database();
  const seed = createSeedInspectionStorageSnapshot();

  for (const user of seed.users) {
    db.tables.users.push({ 
      ...user, 
      disciplines: JSON.stringify(user.disciplines),
      accessibleProjectIds: JSON.stringify(user.accessibleProjectIds)
    });
  }

  for (const project of seed.projects) {
    db.tables.projects.push({ ...project, recipients: JSON.stringify(project.recipients) });
  }

  for (const ship of seed.ships) {
    db.tables.ships.push({ ...ship });
  }

  for (const item of seed.inspectionItems) {
    db.tables.inspection_items.push({ ...item });
  }

  for (const round of seed.inspectionRounds) {
    db.tables.inspection_rounds.push({ ...round });
  }

  for (const comment of seed.comments) {
    db.tables.comments.push({ ...comment });
  }

  db.deletedTables = [];
  db.updatedTables = [];
  db.insertedTables = [];
  db.executedSql = [];
  const headers = await loginAndCreateAuthHeader(app, {
    D1_DRIVER: "d1",
    DB: db
  });
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
      D1_DRIVER: "d1",
      DB: db
    }
  );

  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.deepEqual(db.deletedTables, []);
  assert.deepEqual(db.updatedTables, ["inspection_rounds", "inspection_items"]);
  assert.deepEqual(db.insertedTables, ["comments"]);
  assert.deepEqual(db.executedSql.slice(0, 7), [
    'SELECT * FROM "users" WHERE "id" = ?',
    'SELECT * FROM "inspection_items" WHERE "id" = ?',
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ? AND "roundNumber" = ?',
    'SELECT COUNT(*) AS "count" FROM "comments" WHERE "inspectionItemId" = ? AND "status" = ?',
    INSPECTION_DETAIL_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" = ?',
    'SELECT * FROM "comments" WHERE "inspectionItemId" = ?'
  ]);
  assert.equal(db.executedSql[7], 'SELECT * FROM "users" WHERE "id" IN (?)');
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
  const db = new FakeD1Database();
  const seed = createSeedInspectionStorageSnapshot();

  for (const user of seed.users) {
    db.tables.users.push({ 
      ...user, 
      disciplines: JSON.stringify(user.disciplines),
      accessibleProjectIds: JSON.stringify(user.accessibleProjectIds)
    });
  }

  for (const project of seed.projects) {
    db.tables.projects.push({ ...project, recipients: JSON.stringify(project.recipients) });
  }

  for (const ship of seed.ships) {
    db.tables.ships.push({ ...ship });
  }

  for (const item of seed.inspectionItems) {
    db.tables.inspection_items.push({ ...item });
  }

  for (const round of seed.inspectionRounds) {
    db.tables.inspection_rounds.push({ ...round });
  }

  for (const comment of seed.comments) {
    db.tables.comments.push({ ...comment });
  }

  db.executedSql = [];
  const headers = await loginAndCreateAuthHeader(app, {
    D1_DRIVER: "d1",
    DB: db
  });
  db.executedSql = [];

  const response = await app.request("http://localhost/api/inspections/insp-003", { headers }, {
    D1_DRIVER: "d1",
    DB: db
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.id, "insp-003");
  assert.equal(
    db.executedSql.some((sql) => /^SELECT \* FROM "(users|projects|ships|inspection_items|inspection_rounds|comments)"$/.test(sql)),
    false
  );
  assert.deepEqual(
    db.executedSql,
    [
      'SELECT * FROM "users" WHERE "id" = ?',
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
  const db = new FakeD1Database();
  const seed = createSeedInspectionStorageSnapshot();

  for (const user of seed.users) {
    db.tables.users.push({ 
      ...user, 
      disciplines: JSON.stringify(user.disciplines),
      accessibleProjectIds: JSON.stringify(user.accessibleProjectIds)
    });
  }

  for (const project of seed.projects) {
    db.tables.projects.push({ ...project, recipients: JSON.stringify(project.recipients) });
  }

  for (const ship of seed.ships) {
    db.tables.ships.push({ ...ship });
  }

  for (const item of seed.inspectionItems) {
    db.tables.inspection_items.push({ ...item });
  }

  for (const round of seed.inspectionRounds) {
    db.tables.inspection_rounds.push({ ...round });
  }

  for (const comment of seed.comments) {
    db.tables.comments.push({ ...comment });
  }

  db.executedSql = [];
  const headers = await loginAndCreateAuthHeader(app, {
    D1_DRIVER: "d1",
    DB: db
  });
  db.executedSql = [];

  const response = await app.request("http://localhost/api/inspections", { headers }, {
    D1_DRIVER: "d1",
    DB: db
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.items.length, 5);
  assert.equal(
    db.executedSql.some((sql) =>
      /^SELECT \* FROM "(users|projects|ships|inspection_rounds|comments)"$/.test(sql)
    ),
    false
  );
  assert.deepEqual(db.executedSql, [
    'SELECT * FROM "users" WHERE "id" = ?',
    INSPECTION_LIST_SUMMARY_SQL,
    'SELECT * FROM "inspection_rounds" WHERE "inspectionItemId" IN (?, ?, ?, ?, ?)'
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

test("PUT /api/inspections/:id/rounds/current/result accepts CX without adding comments", async () => {
  const app = createTestApp();
  const headers = await loginAndCreateAuthHeader(app);
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
        resolvedBy: "user-li-si",
        expectedVersion: initialVersion
      })
    }
  );
  const resolvePayload = await resolveResponse.json();

  assert.equal(resolveResponse.status, 200);
  assert.equal(resolvePayload.ok, true);
  assert.equal(resolvePayload.data.openCommentCount, initialPayload.data.openCommentCount - 1);

  // 3. 验证持久化状态
  const finalResponse = await app.request("http://localhost/api/inspections/insp-002", { headers });
  const finalPayload = await finalResponse.json();
  const resolvedComment = finalPayload.data.comments.find(c => c.id === targetComment.id);

  assert.equal(resolvedComment.status, "closed");
  assert.equal(resolvedComment.resolvedBy, "user-li-si");
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
