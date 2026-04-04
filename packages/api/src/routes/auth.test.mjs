import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../index.ts";
import { createPasswordHash, verifyPasswordHash } from "../auth/password.ts";
import { verifyAccessToken } from "../auth/jwt.ts";
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
}

class FakeAuthD1Database {
  constructor() {
    this.tables = { users: [] };
    this.executedSql = [];
  }

  prepare(sql) {
    return new FakePreparedStatement(this, sql);
  }

  select(sql, params) {
    this.executedSql.push(sql);

    if (sql === 'SELECT * FROM "users" WHERE "username" = ?') {
      return this.tables.users.filter((record) => record.username === params[0]);
    }

    if (sql === 'SELECT * FROM "users" WHERE "id" = ?') {
      return this.tables.users.filter((record) => record.id === params[0]);
    }

    {
      throw new Error(`Unsupported SQL: ${sql}`);
    }
  }
}

test("createPasswordHash creates hashes that verify correctly", async () => {
  const hash = await createPasswordHash("nbins-secret", {
    iterations: 1000,
    saltHex: "00112233445566778899aabbccddeeff"
  });

  assert.match(
    hash,
    /^pbkdf2_sha256\$1000\$00112233445566778899aabbccddeeff\$[0-9a-f]{64}$/
  );
  assert.equal(await verifyPasswordHash("nbins-secret", hash), true);
  assert.equal(await verifyPasswordHash("wrong-secret", hash), false);
  assert.equal(await verifyPasswordHash("nbins-secret", "dev-only"), false);
});

test("POST /api/auth/login authenticates the default mock user", async () => {
  const app = createApp();
  const response = await app.request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "li.si",
      password: "nbins-dev-li-2026"
    })
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.data.token, "string");
  assert.ok(payload.data.token.length > 20);
  assert.deepEqual(payload.data.user, {
    id: "user-inspector-li",
    username: "li.si",
    displayName: "Li Si",
    role: "inspector",
    disciplines: ["PAINT", "MACHINERY"]
  });

  const claims = await verifyAccessToken(payload.data.token, {});
  assert.deepEqual(claims, {
    id: "user-inspector-li",
    role: "inspector",
    disciplines: ["PAINT", "MACHINERY"]
  });
});

test("POST /api/auth/login rejects invalid credentials", async () => {
  const app = createApp();
  const response = await app.request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "li.si",
      password: "wrong-password"
    })
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Invalid username or password");
});

test("POST /api/auth/login validates required fields", async () => {
  const app = createApp();
  const response = await app.request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: " ",
      password: ""
    })
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "username is required");
});

test("POST /api/auth/login uses narrow D1 user lookup", async () => {
  const app = createApp();
  const db = new FakeAuthD1Database();
  const seed = createSeedInspectionStorageSnapshot();

  for (const user of seed.users) {
    db.tables.users.push({ ...user, disciplines: JSON.stringify(user.disciplines) });
  }

  const response = await app.request(
    "http://localhost/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "wang.wu",
        password: "nbins-dev-wang-2026"
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
  assert.deepEqual(db.executedSql, ['SELECT * FROM "users" WHERE "username" = ?']);
});

test("POST /api/auth/login requires JWT_SECRET in production env", async () => {
  const app = createApp();
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
    {
      APP_ENV: "production"
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(payload, {
    ok: false,
    error: "JWT_SECRET is required when APP_ENV=production"
  });
});

test("GET /api/auth/me returns 401 without bearer token", async () => {
  const app = createApp();
  const response = await app.request("http://localhost/api/auth/me");
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    ok: false,
    error: "Authorization header must use Bearer token"
  });
});

test("GET /api/auth/me returns the authenticated user profile", async () => {
  const app = createApp();
  const loginResponse = await app.request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "li.si",
      password: "nbins-dev-li-2026"
    })
  });
  const loginPayload = await loginResponse.json();

  assert.equal(loginResponse.status, 200);

  const response = await app.request("http://localhost/api/auth/me", {
    headers: { authorization: `Bearer ${loginPayload.data.token}` }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    data: {
      user: {
        id: "user-inspector-li",
        username: "li.si",
        displayName: "Li Si",
        role: "inspector",
        disciplines: ["PAINT", "MACHINERY"]
      }
    }
  });
});

test("GET /api/auth/me uses narrow D1 user lookup by id", async () => {
  const app = createApp();
  const db = new FakeAuthD1Database();
  const seed = createSeedInspectionStorageSnapshot();

  for (const user of seed.users) {
    db.tables.users.push({ ...user, disciplines: JSON.stringify(user.disciplines) });
  }

  const loginResponse = await app.request(
    "http://localhost/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "wang.wu",
        password: "nbins-dev-wang-2026"
      })
    },
    {
      D1_DRIVER: "d1",
      DB: db
    }
  );
  const loginPayload = await loginResponse.json();

  assert.equal(loginResponse.status, 200);

  db.executedSql = [];

  const response = await app.request(
    "http://localhost/api/auth/me",
    {
      headers: { authorization: `Bearer ${loginPayload.data.token}` }
    },
    {
      D1_DRIVER: "d1",
      DB: db
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.deepEqual(db.executedSql, ['SELECT * FROM "users" WHERE "id" = ?']);
});
