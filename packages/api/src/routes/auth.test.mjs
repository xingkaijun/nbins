import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../index.ts";
import { createPasswordHash, verifyPasswordHash } from "../auth/password.ts";
import { verifyAccessToken } from "../auth/jwt.ts";
import { createBaselineInspectionStorage } from "../test-support/baseline-fixture.mjs";
import { createTestDatabase, createTestEnv } from "../test-support/test-database.mjs";

// Requests run against the real D1 storage on an in-memory SQLite with the real
// schema (see ../test-support/test-database.mjs); the mock storage driver these
// tests used to fall back to was removed in commit 84b37ac.
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

function createSeededD1() {
  return createTestDatabase(createBaselineInspectionStorage());
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

test("POST /api/auth/login authenticates a seeded D1 user", async () => {
  const app = createTestApp();
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
    disciplines: ["PAINT", "MACH"]
  });

  const claims = await verifyAccessToken(payload.data.token, {});
  assert.deepEqual(claims, {
    id: "user-inspector-li",
    role: "inspector",
    disciplines: ["PAINT", "MACH"]
  });
});

test("POST /api/auth/login rejects invalid credentials", async () => {
  const app = createTestApp();
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
  const app = createTestApp();
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
  const app = createTestApp();
  const db = createSeededD1();

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
      DB: db
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  // D1SeededInspectionStorage first runs its seed gate (COUNT on users, see
  // d1-seeded-inspection-storage.ts); the user itself is fetched by one narrow
  // lookup and never by a full users scan.
  assert.deepEqual(db.executedSql, [SEED_GATE_SQL, 'SELECT * FROM "users" WHERE "username" = ?']);
});

test("POST /api/auth/login requires JWT_SECRET in production env", async () => {
  const app = createTestApp();
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
      // Real D1 binding so the request reaches token issuing; only JWT_SECRET is missing.
      ...app.env,
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
  const app = createTestApp();
  const response = await app.request("http://localhost/api/auth/me");
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    ok: false,
    error: "Authorization header must use Bearer token"
  });
});

test("GET /api/auth/me returns the authenticated user profile", async () => {
  const app = createTestApp();
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
        disciplines: ["PAINT", "MACH"]
      }
    }
  });
});

test("GET /api/auth/me uses narrow D1 user lookup by id", async () => {
  const app = createTestApp();
  const db = createSeededD1();

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
      DB: db
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  // requireAuth and the /me handler each resolve storage (one seed gate COUNT
  // each) and each read the user by id; no full users scan.
  assert.deepEqual(db.executedSql, [
    SEED_GATE_SQL,
    'SELECT * FROM "users" WHERE "id" = ?',
    SEED_GATE_SQL,
    'SELECT * FROM "users" WHERE "id" = ?'
  ]);
});

test("GET /api/auth/me rejects tokens for inactive users", async () => {
  const app = createTestApp();
  const db = createSeededD1();

  const loginResponse = await app.request(
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
      DB: db
    }
  );
  const loginPayload = await loginResponse.json();

  assert.equal(loginResponse.status, 200);

  const user = db.tables.users.find((record) => record.id === "user-inspector-li");
  assert.ok(user);
  await db.prepare('UPDATE "users" SET "isActive" = 0 WHERE "id" = ?').bind("user-inspector-li").run();

  const meResponse = await app.request(
    "http://localhost/api/auth/me",
    {
      headers: { authorization: `Bearer ${loginPayload.data.token}` }
    },
    {
      DB: db
    }
  );
  const mePayload = await meResponse.json();

  assert.equal(meResponse.status, 401);
  assert.deepEqual(mePayload, {
    ok: false,
    error: "Invalid access token"
  });
});
