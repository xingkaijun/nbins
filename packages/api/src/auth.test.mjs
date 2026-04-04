import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createRequireAuth, createRequireRole, extractBearerToken } from "./auth.ts";

function createProtectedApp(verifyAccessToken) {
  const app = new Hono();

  app.use("/protected/*", createRequireAuth({ verifyAccessToken }));
  app.use("/admin/*", createRequireAuth({ verifyAccessToken }), createRequireRole(["admin"]));

  app.get("/protected/profile", (c) =>
    c.json({
      ok: true,
      data: c.get("authUser")
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
  const app = createProtectedApp(async () => null);
  const response = await app.request("http://localhost/protected/profile");
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    ok: false,
    error: "Authorization header must use Bearer token"
  });
});

test("protected route returns 401 when bearer token verification fails", async () => {
  const app = createProtectedApp(async (token) => {
    assert.equal(token, "bad-token");
    return null;
  });

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

test("protected route returns 403 when verified user is inactive", async () => {
  const app = createProtectedApp(async () => ({
    id: "user-inspector-li",
    username: "li.si",
    displayName: "Li Si",
    role: "inspector",
    disciplines: ["hull"],
    isActive: false
  }));

  const response = await app.request("http://localhost/protected/profile", {
    headers: { authorization: "Bearer inactive-token" }
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(payload, {
    ok: false,
    error: "User account is inactive"
  });
});

test("protected route exposes verified auth user on request context", async () => {
  const app = createProtectedApp(async (token) => ({
    id: "user-inspector-wang",
    username: "wang.wu",
    displayName: `Verified ${token}`,
    role: "inspector",
    disciplines: ["hull", "paint"],
    isActive: true
  }));

  const response = await app.request("http://localhost/protected/profile", {
    headers: { authorization: "Bearer live-token" }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    data: {
      id: "user-inspector-wang",
      username: "wang.wu",
      displayName: "Verified live-token",
      role: "inspector",
      disciplines: ["hull", "paint"]
    }
  });
});

test("admin route returns 403 when authenticated user lacks required role", async () => {
  const app = createProtectedApp(async () => ({
    id: "user-inspector-wang",
    username: "wang.wu",
    displayName: "Wang Wu",
    role: "inspector",
    disciplines: ["hull"],
    isActive: true
  }));

  const response = await app.request("http://localhost/admin/users", {
    headers: { authorization: "Bearer inspector-token" }
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(payload, {
    ok: false,
    error: "Forbidden"
  });
});

test("admin route succeeds when authenticated user has required role", async () => {
  const app = createProtectedApp(async () => ({
    id: "user-admin-chen",
    username: "chen.admin",
    displayName: "Chen Admin",
    role: "admin",
    disciplines: [],
    isActive: true
  }));

  const response = await app.request("http://localhost/admin/users", {
    headers: { authorization: "Bearer admin-token" }
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
