import assert from "node:assert/strict";
import test from "node:test";

import { LocalSqliteDatabase } from "../platform/sqlite-database.ts";
import { findMissingColumns, listAppliedMigrations, migrate, MIGRATIONS } from "./migrate.ts";
import { schema } from "./schema.ts";
import { createIndexStatements } from "./sql.ts";

function names(db, type) {
  return db.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all(type)
    .map((row) => row.name);
}

test("migrate on an empty database creates every table and index and records the migration", () => {
  const db = new LocalSqliteDatabase(":memory:");
  try {
    const report = migrate(db, () => "2026-10-31T00:00:00.000Z");

    assert.deepEqual(report.applied, MIGRATIONS.map((m) => m.id));
    assert.deepEqual(report.alreadyApplied, []);
    assert.deepEqual(report.addedColumns, []);
    assert.deepEqual(report.manualColumns, []);
    assert.deepEqual(
      names(db, "table"),
      [...Object.values(schema).map((t) => t.name), "schema_migrations"].sort()
    );
    assert.equal(names(db, "index").filter((n) => n.startsWith("idx_")).length, createIndexStatements.length);
    assert.deepEqual(listAppliedMigrations(db), ["0001_baseline"]);
  } finally {
    db.close();
  }
});

test("migrate is idempotent", () => {
  const db = new LocalSqliteDatabase(":memory:");
  try {
    migrate(db);
    db.sqlite.exec("INSERT INTO projects (id, name, code, createdAt, updatedAt) VALUES ('p1','P','C','t','t')");
    const second = migrate(db);

    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.alreadyApplied, ["0001_baseline"]);
    assert.deepEqual(second.addedColumns, []);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM projects").get().n, 1);
  } finally {
    db.close();
  }
});

test("migrate adds columns an older (imported) database lacks, keeping its rows", () => {
  const db = new LocalSqliteDatabase(":memory:");
  try {
    // An old production users table, before the title/disciplines ALTER scripts.
    db.sqlite.exec(`CREATE TABLE "users" (
      "id" TEXT PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "displayName" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL, "role" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL);
      INSERT INTO users VALUES ('u1','admin1','Admin','hash','admin','t','t');`);

    const before = findMissingColumns(db);
    assert.ok(before.addable.some((fix) => fix.table === "users" && fix.column === "disciplines"));

    const report = migrate(db);
    const added = report.addedColumns.filter((fix) => fix.table === "users").map((fix) => fix.column);
    assert.deepEqual(added.sort(), ["accessibleProjectIds", "disciplines", "isActive", "title"]);
    assert.deepEqual(report.manualColumns, []);
    assert.deepEqual(findMissingColumns(db), { addable: [], manual: [] });

    const user = db.sqlite.prepare("SELECT * FROM users WHERE id = 'u1'").get();
    assert.equal(user.username, "admin1");
    assert.equal(user.title, null);
    assert.equal(user.disciplines, "[]");
    assert.equal(user.isActive, 1);
  } finally {
    db.close();
  }
});
