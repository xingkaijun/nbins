import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../index.ts";
import { issueAccessToken } from "../auth/jwt.ts";
import { getNcrObjectKey, getNcrPdfObjectKey } from "../services/ncr-storage.ts";

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

  async first() {
    return this.#db.select(this.#sql, this.#params)[0] ?? null;
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
      project_members: [],
      ships: [],
      ncr_index: []
    };
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
    const countMatch = sql.match(/SELECT COUNT\(\*\) AS (?:"([^"]+)"|(\w+)) FROM\s+"?([^"]+)"?/i);
    if (countMatch) {
      const alias = countMatch[1] ?? countMatch[2] ?? "count";
      const tableName = countMatch[3];
      return [{ [alias]: (this.tables[tableName] ?? []).length }];
    }

    const tableName = sql.match(/FROM\s+"?([^"]+)"?/i)?.[1];
    if (!tableName) {
      return [];
    }

    let rows = [...(this.tables[tableName] ?? [])];

    const inMatch = sql.match(/WHERE\s+"([^"]+)"\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      const [, column] = inMatch;
      rows = rows.filter((row) => params.includes(row[column]));
    }

    const equalsMatches = [...sql.matchAll(/"([^"]+)"\s*=\s*\?/g)];
    if (equalsMatches.length > 0) {
      rows = rows.filter((row) => equalsMatches.every((match, index) => row[match[1]] === params[index]));
    }

    return this.#projectRows(sql, rows);
  }

  #projectRows(sql, rows) {
    const selectClause = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i)?.[1]?.trim() ?? "*";
    if (selectClause === "*") {
      return rows.map((row) => ({ ...row }));
    }

    const columns = [...selectClause.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    return rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
  }

  execute(sql, params) {
    const deleteMatch = sql.match(/DELETE FROM\s+"([^"]+)"\s+WHERE\s+"id"\s*=\s*\?/i);
    if (deleteMatch) {
      const [, tableName] = deleteMatch;
      const id = params[0];
      this.tables[tableName] = this.tables[tableName].filter((row) => row.id !== id);
      return;
    }

    const insertMatch = sql.match(/INSERT INTO\s+"([^"]+)"\s*\(([^)]+)\)/is);
    if (insertMatch) {
      const [, tableName, rawColumns] = insertMatch;
      const columns = rawColumns.split(",").map((column) => column.trim().replaceAll('"', ""));
      const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
      const existingIndex = this.tables[tableName].findIndex((entry) => entry.id === row.id);
      if (existingIndex >= 0) {
        this.tables[tableName][existingIndex] = { ...this.tables[tableName][existingIndex], ...row };
      } else {
        this.tables[tableName].push(row);
      }
      return;
    }

    throw new Error(`Unsupported SQL in test DB: ${sql}`);
  }
}

class FakeBucketObject {
  constructor(body, httpMetadata = {}) {
    this.body = body;
    this.httpMetadata = httpMetadata;
    this.httpEtag = 'fake-etag';
  }

  async text() {
    if (typeof this.body === "string") {
      return this.body;
    }
    return Buffer.from(this.body).toString("utf8");
  }

  async arrayBuffer() {
    if (typeof this.body === "string") {
      return new TextEncoder().encode(this.body).buffer;
    }
    if (this.body instanceof Uint8Array) {
      return this.body.buffer.slice(this.body.byteOffset, this.body.byteOffset + this.body.byteLength);
    }
    return this.body;
  }
}

class FakeBucket {
  constructor() {
    this.objects = new Map();
    this.deletedKeys = [];
  }

  async put(key, value, options = {}) {
    let body = value;
    if (value instanceof ArrayBuffer) {
      body = new Uint8Array(value);
    }
    this.objects.set(key, new FakeBucketObject(body, options.httpMetadata ?? {}));
  }

  async get(key) {
    return this.objects.get(key) ?? null;
  }

  async delete(key) {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

function seedBaseData(db) {
  const now = "2026-04-14T12:00:00.000Z";
  db.tables.users.push(
    {
      id: "user-manager-1",
      username: "manager1",
      displayName: "MANAGER 1",
      passwordHash: "",
      role: "manager",
      title: "Manager",
      disciplines: "[]",
      accessibleProjectIds: "[]",
      isActive: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "user-reviewer-1",
      username: "reviewer1",
      displayName: "REVIEWER 1",
      passwordHash: "",
      role: "reviewer",
      title: "Reviewer",
      disciplines: "[]",
      accessibleProjectIds: "[]",
      isActive: 1,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "user-inspector-1",
      username: "inspector1",
      displayName: "INSPECTOR 1",
      passwordHash: "",
      role: "inspector",
      title: "Inspector",
      disciplines: "[\"HULL\"]",
      accessibleProjectIds: "[]",
      isActive: 1,
      createdAt: now,
      updatedAt: now
    }
  );

  db.tables.projects.push({
    id: "proj-A",
    name: "Alpha Ocean Testing",
    code: "P-01",
    status: "active",
    owner: "Owner ABC",
    shipyard: "Yard XYZ",
    class: "LR",
    disciplines: "[]",
    reportRecipients: "[]",
    ncrRecipients: "[]",
    createdAt: now,
    updatedAt: now
  });

  db.tables.project_members.push(
    { id: "pm-manager", projectId: "proj-A", userId: "user-manager-1", createdAt: now, updatedAt: now },
    { id: "pm-reviewer", projectId: "proj-A", userId: "user-reviewer-1", createdAt: now, updatedAt: now },
    { id: "pm-inspector", projectId: "proj-A", userId: "user-inspector-1", createdAt: now, updatedAt: now }
  );

  db.tables.ships.push({
    id: "ship-A1",
    projectId: "proj-A",
    hullNumber: "A-001",
    shipName: "Alpha One",
    shipType: "Testing Hull",
    status: "building",
    createdAt: now,
    updatedAt: now
  });
}

async function createAuthHeaders(user) {
  const token = await issueAccessToken({
    id: user.id,
    role: user.role,
    disciplines: user.disciplines ?? []
  }, {});

  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

function createPendingNcr(overrides = {}) {
  return {
    id: "ncr-001",
    projectId: "proj-A",
    shipId: "ship-A1",
    title: "Frame opening mismatch",
    discipline: "HULL",
    serialNo: 1,
    content: "Hull opening location is not aligned with approved drawing.",
    remark: "mock ncr",
    authorId: "user-inspector-1",
    status: "pending_approval",
    approvedBy: null,
    approvedAt: null,
    imageAttachments: [],
    relatedFiles: [],
    pdf: null,
    builderReply: null,
    replyDate: null,
    verifiedBy: null,
    verifyDate: null,
    rectifyRequest: "Adjust opening to drawing dimension.",
    closedBy: null,
    closedAt: null,
    createdAt: "2026-04-14T12:00:00.000Z",
    updatedAt: "2026-04-14T12:00:00.000Z",
    ...overrides
  };
}

async function seedNcr(db, bucket, record) {
  await bucket.put(getNcrObjectKey(record.shipId, record.id), JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: "application/json" }
  });

  db.tables.ncr_index.push({
    id: record.id,
    projectId: record.projectId,
    shipId: record.shipId,
    title: record.title,
    discipline: record.discipline,
    serialNo: record.serialNo,
    remark: record.remark,
    status: record.status,
    authorId: record.authorId,
    approvedBy: record.approvedBy,
    approvedAt: record.approvedAt,
    pdfObjectKey: record.pdf?.objectKey ?? null,
    fileCount: record.relatedFiles.length,
    builderReply: record.builderReply,
    replyDate: record.replyDate,
    verifiedBy: record.verifiedBy,
    verifyDate: record.verifyDate,
    closedBy: record.closedBy,
    closedAt: record.closedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  });
}

function createFixture() {
  const db = new FakeD1Database();
  const bucket = new FakeBucket();
  seedBaseData(db);
  const app = createApp();
  const env = {
    D1_DRIVER: "d1",
    DB: db,
    BUCKET: bucket
  };

  return { app, db, bucket, env };
}

test("PUT /api/ncrs/:id/approve rejects legacy reject requests", async () => {
  const { app, db, bucket, env } = createFixture();
  const record = createPendingNcr();
  await seedNcr(db, bucket, record);
  const headers = await createAuthHeaders({ id: "user-manager-1", role: "manager" });

  const response = await app.request("http://localhost/api/ncrs/ncr-001/approve", {
    method: "PUT",
    headers,
    body: JSON.stringify({ approved: false })
  }, env);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Only publish is supported for NCR approval");
  assert.equal(bucket.objects.has(getNcrPdfObjectKey("ship-A1", "ncr-001")), false);
  assert.equal(db.tables.ncr_index[0].status, "pending_approval");
});

test("PUT /api/ncrs/:id/approve publishes NCR and stores PDF metadata", async () => {
  const { app, db, bucket, env } = createFixture();
  const record = createPendingNcr();
  await seedNcr(db, bucket, record);
  const headers = await createAuthHeaders({ id: "user-manager-1", role: "manager" });

  const response = await app.request("http://localhost/api/ncrs/ncr-001/approve", {
    method: "PUT",
    headers,
    body: JSON.stringify({ approved: true })
  }, env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.status, "approved");
  assert.equal(payload.data.approvedBy, "user-manager-1");
  assert.equal(payload.data.pdf.objectKey, getNcrPdfObjectKey("ship-A1", "ncr-001"));
  assert.equal(bucket.objects.has(getNcrPdfObjectKey("ship-A1", "ncr-001")), true);
  assert.equal(db.tables.ncr_index[0].status, "approved");

  const storedRecord = JSON.parse(await bucket.objects.get(getNcrObjectKey("ship-A1", "ncr-001")).text());
  assert.equal(storedRecord.status, "approved");
  assert.equal(storedRecord.pdf.objectKey, getNcrPdfObjectKey("ship-A1", "ncr-001"));
});

test("DELETE /api/ncrs/:id forbids same-project reviewers who are not author or manager", async () => {
  const { app, db, bucket, env } = createFixture();
  const record = createPendingNcr();
  await seedNcr(db, bucket, record);
  const headers = await createAuthHeaders({ id: "user-reviewer-1", role: "reviewer" });

  const response = await app.request("http://localhost/api/ncrs/ncr-001", {
    method: "DELETE",
    headers
  }, env);
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "forbidden");
  assert.equal(db.tables.ncr_index.length, 1);
  assert.equal(bucket.objects.has(getNcrObjectKey("ship-A1", "ncr-001")), true);

});

test("DELETE /api/ncrs/:id removes NCR index and stored objects", async () => {
  const { app, db, bucket, env } = createFixture();
  const record = createPendingNcr({
    status: "approved",
    approvedBy: "user-manager-1",
    approvedAt: "2026-04-14T13:00:00.000Z",
    relatedFiles: [
      {
        id: "file-001",
        name: "evidence.txt",
        objectKey: "ncr-files/ship-A1/ncr-001/file-001-evidence.txt",
        contentType: "text/plain",
        size: 12,
        uploadedBy: "user-inspector-1",
        uploadedByName: "INSPECTOR 1",
        uploadedAt: "2026-04-14T12:10:00.000Z"
      }
    ],
    pdf: {
      objectKey: getNcrPdfObjectKey("ship-A1", "ncr-001"),
      generatedAt: "2026-04-14T13:00:00.000Z",
      version: 1
    }
  });
  await seedNcr(db, bucket, record);
  await bucket.put(record.relatedFiles[0].objectKey, "evidence", { httpMetadata: { contentType: "text/plain" } });
  await bucket.put(record.pdf.objectKey, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "application/pdf" } });
  const headers = await createAuthHeaders({ id: "user-manager-1", role: "manager" });

  const response = await app.request("http://localhost/api/ncrs/ncr-001", {
    method: "DELETE",
    headers
  }, env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.data, { deleted: true });
  assert.equal(db.tables.ncr_index.length, 0);
  assert.equal(bucket.objects.has(getNcrObjectKey("ship-A1", "ncr-001")), false);
  assert.equal(bucket.objects.has(record.relatedFiles[0].objectKey), false);
  assert.equal(bucket.objects.has(record.pdf.objectKey), false);
  assert.deepEqual(bucket.deletedKeys, [
    getNcrObjectKey("ship-A1", "ncr-001"),
    record.relatedFiles[0].objectKey,
    record.pdf.objectKey
  ]);
});
