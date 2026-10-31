import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalSqliteDatabase } from "./sqlite-database.ts";

function withFileDb(fn) {
  const dir = mkdtempSync(join(tmpdir(), "nbins-sqlite-"));
  const db = new LocalSqliteDatabase(join(dir, "test.db"));
  return Promise.resolve()
    .then(() => fn(db, dir))
    .finally(() => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    });
}

async function createItems(db) {
  await db.exec(
    'CREATE TABLE parents (id TEXT PRIMARY KEY); CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, flag INTEGER, parentId TEXT REFERENCES parents(id));'
  );
}

test("a file database opens with WAL, busy_timeout and foreign keys on", () =>
  withFileDb((db) => {
    assert.equal(db.sqlite.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
    assert.equal(db.sqlite.prepare("PRAGMA busy_timeout").get().timeout, 5000);
    assert.equal(db.sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.equal(db.sqlite.prepare("PRAGMA synchronous").get().synchronous, 1); // NORMAL
  }));

test("run() reports changes and last_row_id; all() and first() return plain rows", () =>
  withFileDb(async (db) => {
    await createItems(db);
    const inserted = await db.prepare("INSERT INTO items (name, flag) VALUES (?, ?)").bind("a", true).run();
    assert.equal(inserted.success, true);
    assert.equal(inserted.meta.changes, 1);
    assert.equal(inserted.meta.last_row_id, 1);
    await db.prepare("INSERT INTO items (name, flag) VALUES (?, ?)").bind("b", false).run();

    const all = await db.prepare("SELECT name, flag FROM items ORDER BY id").all();
    assert.deepEqual(all.results, [
      { name: "a", flag: 1 },
      { name: "b", flag: 0 }
    ]);
    assert.equal(Object.getPrototypeOf(all.results[0]), Object.prototype);

    assert.deepEqual(await db.prepare("SELECT name FROM items WHERE name = ?").bind("b").first(), { name: "b" });
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM items").first("n"), 2);
    assert.equal(await db.prepare("SELECT name FROM items WHERE name = ?").bind("zzz").first(), null);
    await assert.rejects(db.prepare("SELECT name FROM items").first("nope"), /SQL_COLUMN_NOTFOUND/);
    assert.deepEqual(await db.prepare("SELECT id, name FROM items ORDER BY id").raw(), [
      [1, "a"],
      [2, "b"]
    ]);

    const updated = await db.prepare("UPDATE items SET flag = 1").run();
    assert.equal(updated.meta.changes, 2);

    const returning = await db.prepare("DELETE FROM items WHERE name = ? RETURNING id").bind("a").all();
    assert.deepEqual(returning.results, [{ id: 1 }]);
    assert.equal(returning.meta.changes, 1);
  }));

test("bind() rejects undefined like the previous driver did", () =>
  withFileDb(async (db) => {
    await createItems(db);
    assert.throws(() => db.prepare("INSERT INTO items (name) VALUES (?)").bind(undefined), /SQL_TYPE_ERROR/);
  }));

test("batch() is atomic: a failing statement rolls back the whole batch", () =>
  withFileDb(async (db) => {
    await createItems(db);
    await db.prepare("INSERT INTO items (name) VALUES ('keep')").run();

    await assert.rejects(
      db.batch([
        db.prepare("INSERT INTO items (name) VALUES (?)").bind("x"),
        db.prepare("UPDATE items SET flag = 9"),
        db.prepare("INSERT INTO items (name) VALUES (?)").bind("keep") // UNIQUE violation
      ]),
      /UNIQUE/
    );

    assert.deepEqual((await db.prepare("SELECT name, flag FROM items").all()).results, [{ name: "keep", flag: null }]);

    const results = await db.batch([
      db.prepare("INSERT INTO items (name) VALUES (?)").bind("y"),
      db.prepare("SELECT COUNT(*) AS n FROM items")
    ]);
    assert.equal(results[0].meta.changes, 1);
    assert.deepEqual(results[1].results, [{ n: 2 }]);

    // The connection is usable after a failed batch (no transaction left open).
    await db.prepare("INSERT INTO items (name) VALUES ('after')").run();
    assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM items").first("n"), 3);
  }));

test("foreign keys are enforced", () =>
  withFileDb(async (db) => {
    await createItems(db);
    await assert.rejects(
      db.prepare("INSERT INTO items (name, parentId) VALUES (?, ?)").bind("orphan", "missing").run(),
      /FOREIGN KEY/
    );
  }));

test("a second connection sees committed writes (WAL) and waits for locks", () =>
  withFileDb(async (db, dir) => {
    await createItems(db);
    const other = new LocalSqliteDatabase(join(dir, "test.db"), { busyTimeoutMs: 100 });
    try {
      await db.prepare("INSERT INTO items (name) VALUES ('shared')").run();
      assert.equal(await other.prepare("SELECT COUNT(*) AS n FROM items").first("n"), 1);

      db.sqlite.exec("BEGIN IMMEDIATE");
      try {
        // Readers are not blocked by the open write transaction ...
        assert.equal(await other.prepare("SELECT COUNT(*) AS n FROM items").first("n"), 1);
        // ... but a second writer times out after busy_timeout instead of corrupting anything.
        await assert.rejects(other.prepare("INSERT INTO items (name) VALUES ('blocked')").run(), /locked|busy/i);
      } finally {
        db.sqlite.exec("ROLLBACK");
      }
    } finally {
      other.close();
    }
  }));
