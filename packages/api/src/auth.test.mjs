import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createRequireAuth, createRequireRole, extractBearerToken } from "./auth.ts";
import { issueAccessToken } from "./auth/jwt.ts";

function createProtectedApp() {
  const app = new Hono();

  app.use("/protected/*", createRequireAuth());
  app.use("/admin/*", createRequireAuth(), createRequireRole(["admin"]));

  app.get("/protected/profile", (c) =>
    c.json({
      ok: true,
      data: c.get("user")
    })
  );

  app.get("/admin/users", (c) =>
    c.json({
      ok: true,
      data: { requestedBy: c.get("authUser").id }
    })
  );

  return app;
}

test("extractBearerToken accepts a single bearer token", () => {
  assert.equal(extractBearerToken("Bearer token-123"), "token-123");
  assert.equal(extractBearerToken("bearer token-123"), "token-123");
});

test("extractBearerToken rejects missing or malformed authorization headers", () => {
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken(""), null);
  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken("Bearer"), null);
  assert.equal(extractBearerToken("Bearer token extra"), null);
});

test("protected route returns 401 when authorization header is missing", async () => {
  const app = createProtectedApp();
  const response = await app.request("http://localhost/protected/profile");
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    ok: false,
    error: "Authorization header must use Bearer token"
  });
});

test("protected route returns 401 when bearer token verification fails", async () => {
  const app = createProtectedApp();

  const response = await app.request("http://localhost/protected/profile", {
    headers: { authorization: "Bearer bad-token" }
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    ok: false,
    error: "Invalid access token"
  });
});

test("protected route exposes verified auth user on request context", async () => {
  const app = createProtectedApp();
  const token = await issueAccessToken({
    id: "user-inspector-wang",
    role: "inspector",
    disciplines: ["HULL", "PAINT"]
  }, {});

  const response = await app.request("http://localhost/protected/profile", {
    headers: { authorization: `Bearer ${token}` }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    data: {
      id: "user-inspector-wang",
      role: "inspector",
      disciplines: ["HULL", "PAINT"]
    }
  });
});

test("admin route returns 403 when authenticated user lacks required role", async () => {
  const app = createProtectedApp();
  const token = await issueAccessToken({
    id: "user-inspector-wang",
    role: "inspector",
    disciplines: ["HULL"]
  }, {});

  const response = await app.request("http://localhost/admin/users", {
    headers: { authorization: `Bearer ${token}` }
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(payload, {
    ok: false,
    error: "Forbidden"
  });
});

test("admin route succeeds when authenticated user has required role", async () => {
  const app = createProtectedApp();
  const token = await issueAccessToken({
    id: "user-admin-chen",
    role: "admin",
    disciplines: []
  }, {});

  const response = await app.request("http://localhost/admin/users", {
    headers: { authorization: `Bearer ${token}` }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    data: {
      requestedBy: "user-admin-chen"
    }
  });
});
