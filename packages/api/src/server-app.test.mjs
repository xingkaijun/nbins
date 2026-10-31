import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { migrate } from "./db/migrate.ts";
import { FileSystemObjectStore } from "./platform/fs-object-store.ts";
import { LocalSqliteDatabase } from "./platform/sqlite-database.ts";
import { createServerApp, resolveInside } from "./server-app.ts";

// End-to-end over the production building blocks: a SQLite file (WAL) migrated
// by the real migration, the file-system object store, and the server app with
// the web dist + SPA fallback. No port is opened (app.request).
function setup({ web = true, base = "/nbins/" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nbins-server-"));
  const db = new LocalSqliteDatabase(join(dir, "nbins.db"));
  migrate(db);
  const dist = join(dir, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<!doctype html><div id=root></div>");
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log('app')");
  writeFileSync(join(dist, "favicon.svg"), "<svg/>");
  writeFileSync(join(dir, "secret.txt"), "do not serve");

  const env = {
    APP_ENV: "development",
    DB: db,
    BUCKET: new FileSystemObjectStore(join(dir, "storage")),
    JWT_SECRET: "test-secret"
  };
  const app = createServerApp({ webDistDir: web ? dist : null, webBasePath: base });
  const request = (path, init) => app.request(path, init, env);
  const cleanup = () => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { request, cleanup, db, dir };
}

async function login(request, prefix = "") {
  const response = await request(`${prefix}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin1", password: "1234" })
  });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.ok, true);
  return body.data.token;
}

test("health, meta and SPA routes are served; unknown assets are 404", async () => {
  const { request, cleanup } = setup();
  try {
    const health = await request("/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const meta = await (await request("/api/meta")).json();
    assert.equal(meta.storageMode, "sqlite+fs");

    const redirect = await request("/nbins");
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "/nbins/");

    for (const path of ["/nbins/", "/nbins/inspections/insp-demo-h2", "/nbins/ncrs/123?tab=files"]) {
      const page = await request(path);
      assert.equal(page.status, 200, path);
      assert.match(page.headers.get("content-type"), /text\/html/);
      assert.equal(page.headers.get("cache-control"), "no-cache");
      assert.match(await page.text(), /id=root/);
    }

    const asset = await request("/nbins/assets/index-abc123.js");
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.match(asset.headers.get("cache-control"), /immutable/);
    assert.equal(await asset.text(), "console.log('app')");

    assert.equal((await request("/nbins/favicon.svg")).headers.get("content-type"), "image/svg+xml");
    assert.equal((await request("/nbins/assets/missing-999.js")).status, 404);

    for (const path of ["/nbins/..%2fsecret.txt", "/nbins/%2e%2e/secret.txt", "/nbins/assets/..%2f..%2fsecret.txt"]) {
      const response = await request(path);
      assert.doesNotMatch(await response.text(), /do not serve/, path);
    }
    assert.equal(resolveInside("/srv/dist", "..%2fsecret.txt"), null);
    assert.equal(resolveInside("/srv/dist", "assets/a.js"), "/srv/dist/assets/a.js");
  } finally {
    cleanup();
  }
});

test("login seeds an empty database; list and detail work on the SQLite file", async () => {
  const { request, cleanup, db } = setup();
  try {
    const token = await login(request);
    const auth = { authorization: `Bearer ${token}` };

    assert.ok(db.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0);

    const unauthorized = await request("/api/inspections");
    assert.equal(unauthorized.status, 401);

    const list = await request("/api/inspections", { headers: auth });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.ok, true);
    assert.ok(Array.isArray(listBody.data.items), JSON.stringify(listBody).slice(0, 200));
    assert.ok(listBody.data.items.length > 0, "seed provides inspection items");

    const first = listBody.data.items[0];
    const detail = await request(`/api/inspections/${first.id}`, { headers: auth });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).data.id, first.id);

    const missing = await request("/api/inspections/does-not-exist", { headers: auth });
    assert.equal(missing.status, 404);

    const projects = await request("/api/projects", { headers: auth });
    assert.equal(projects.status, 200);

    // The same API under the web base (builds with VITE_NBINS_API_BASE_URL=/nbins/api).
    const tokenViaBase = await login(request, "/nbins");
    const listViaBase = await request("/nbins/api/inspections", { headers: { authorization: `Bearer ${tokenViaBase}` } });
    assert.equal(listViaBase.status, 200);
    assert.equal((await listViaBase.json()).data.items.length, listBody.data.items.length);
    assert.equal((await request("/nbins/health")).status, 200);
  } finally {
    cleanup();
  }
});

test("media upload, list, download and delete go through the file store", async () => {
  const { request, cleanup, dir } = setup();
  try {
    const token = await login(request);
    const auth = { authorization: `Bearer ${token}` };
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const form = new FormData();
    form.set("shipId", "ship-A1");
    form.set("file", new File([bytes], "deck.png", { type: "image/png" }));

    const upload = await request("/api/media/upload", { method: "POST", headers: auth, body: form });
    assert.equal(upload.status, 200, await upload.clone().text());
    const uploaded = (await upload.json()).data;
    assert.match(uploaded.key, /^media\/ship-A1\/.+deck\.png$/);

    const listed = await (await request("/api/media/ship-A1", { headers: auth })).json();
    assert.deepEqual(listed.data, [uploaded.key]);

    const download = await request(`/api/media/ship-A1/${uploaded.filename}`, { headers: auth });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);

    const store = new FileSystemObjectStore(join(dir, "storage"));
    assert.ok(await store.head(uploaded.key));

    const removed = await request(`/api/media/ship-A1/${uploaded.filename}`, { method: "DELETE", headers: auth });
    assert.equal(removed.status, 200);
    assert.equal(await store.head(uploaded.key), null);
  } finally {
    cleanup();
  }
});

test("API-only mode (no NBINS_WEB_DIST) does not serve the web app", async () => {
  const { request, cleanup } = setup({ web: false });
  try {
    assert.equal((await request("/health")).status, 200);
    assert.equal((await request("/nbins/inspections/x")).status, 404);
  } finally {
    cleanup();
  }
});

test("web app at the root base still routes /api and /health to the API", async () => {
  const { request, cleanup } = setup({ base: "/" });
  try {
    assert.equal((await (await request("/health")).json()).ok, true);
    assert.equal((await request("/api/meta")).headers.get("content-type").includes("json"), true);
    assert.match(await (await request("/inspections/abc")).text(), /id=root/);
    assert.equal((await request("/assets/index-abc123.js")).status, 200);
  } finally {
    cleanup();
  }
});

test("fresh database has isHighlighted; comment highlight persists across a remark", async () => {
  const { request, cleanup, db } = setup();
  try {
    const token = await login(request);
    const auth = { authorization: `Bearer ${token}` };
    const json = { ...auth, "content-type": "application/json" };

    for (const table of ["comments", "observations"]) {
      const columns = db.sqlite.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name);
      assert.ok(columns.includes("isHighlighted"), `${table} has isHighlighted: ${columns.join(",")}`);
    }

    const list = await request("/api/observations/inspection-comments", { headers: auth });
    assert.equal(list.status, 200, await list.clone().text());
    const comments = (await list.json()).data;
    assert.ok(comments.length > 0, "seed provides inspection comments");
    const target = comments.find((comment) => comment.status === "open") ?? comments[0];
    assert.equal(target.isHighlighted, 0);

    const highlight = await request(`/api/inspections/${target.inspectionItemId}/comments/${target.id}/highlight`, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ isHighlighted: 1 })
    });
    assert.equal(highlight.status, 200, await highlight.clone().text());

    // A later remark on the same comment must not reset the highlight.
    const detail = await (await request(`/api/inspections/${target.inspectionItemId}`, { headers: auth })).json();
    const remark = await request(`/api/inspections/${target.inspectionItemId}/comments/${target.id}/remark`, {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ expectedVersion: detail.data.version, remark: "checked" })
    });
    assert.equal(remark.status, 200, await remark.clone().text());

    const after = (await (await request("/api/observations/inspection-comments", { headers: auth })).json()).data;
    const updated = after.find((comment) => comment.id === target.id);
    assert.equal(updated.isHighlighted, 1);
    assert.equal(updated.resolveRemark, "checked");
  } finally {
    cleanup();
  }
});
