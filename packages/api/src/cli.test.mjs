import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LocalSqliteDatabase } from "./platform/sqlite-database.ts";

const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));

function runCli(dataDir, ...args) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", CLI, ...args],
    {
      cwd: dataDir,
      encoding: "utf8",
      env: { PATH: process.env.PATH, NBINS_DATA_DIR: dataDir }
    }
  );
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

function withDataDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "nbins-cli-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function count(dbPath, table) {
  const db = new LocalSqliteDatabase(dbPath, { readOnly: true });
  try {
    return db.sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
  } finally {
    db.close();
  }
}

// Shaped like `wrangler d1 export --output`: PRAGMA, CREATE TABLE in the
// production's (older) shape, INSERT ... VALUES, an internal _cf_KV table.
const D1_EXPORT = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB) WITHOUT ROWID;
CREATE TABLE "users" ("id" TEXT PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "displayName" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "role" TEXT NOT NULL, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL);
INSERT INTO "users" VALUES('u-1','boss','Boss','x','admin','2026-01-01','2026-01-01');
INSERT INTO "users" VALUES('u-2','insp','Inspector; with semicolon','x','inspector','2026-01-01','2026-01-01');
CREATE TABLE "projects" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "code" TEXT NOT NULL UNIQUE, "status" TEXT NOT NULL DEFAULT 'active', "owner" TEXT, "shipyard" TEXT, "class" TEXT, "disciplines" TEXT NOT NULL DEFAULT '[]', "reportRecipients" TEXT NOT NULL DEFAULT '[]', "ncrRecipients" TEXT NOT NULL DEFAULT '[]', "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL);
INSERT INTO "projects" VALUES('p-1','Prod project','PRJ','active',NULL,NULL,NULL,'[]','[]','[]','2026-01-01','2026-01-01');
`;

test("init creates and seeds the database; check passes; init is idempotent", () =>
  withDataDir((dir) => {
    const first = runCli(dir, "init");
    assert.equal(first.code, 0, first.out);
    assert.match(first.out, /migrations applied now: 0001_baseline/);
    assert.match(first.out, /seeded initial accounts/);
    const dbPath = join(dir, "nbins.db");
    const users = count(dbPath, "users");
    assert.ok(users > 0);

    const second = runCli(dir, "init");
    assert.equal(second.code, 0, second.out);
    assert.match(second.out, /migrations applied now: \(none\)/);
    assert.match(second.out, /nothing seeded/);
    assert.equal(count(dbPath, "users"), users);

    const check = runCli(dir, "check");
    assert.equal(check.code, 0, check.out);
    assert.match(check.out, /integrity_check: ok/);
    assert.match(check.out, /journal_mode: wal/);
  }));

test("init --sample-data loads the demo SQL into an empty database", () =>
  withDataDir((dir) => {
    const result = runCli(dir, "init", "--sample-data");
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /loaded dummy-data-2\.sql/);
    assert.ok(count(join(dir, "nbins.db"), "inspection_items") > 0);
  }));

test("backup writes a verified database copy and a files archive, pruning old ones", () =>
  withDataDir((dir) => {
    assert.equal(runCli(dir, "init").code, 0);
    mkdirSync(join(dir, "storage", "objects", "ncrs"), { recursive: true });
    writeFileSync(join(dir, "storage", "objects", "ncrs", "n1.json"), "{}");
    const backups = join(dir, "bk");
    mkdirSync(backups);
    for (const old of ["20200101-000000", "20200102-000000"]) {
      writeFileSync(join(backups, `nbins-${old}.db`), "old");
    }

    const result = runCli(dir, "backup", "--out", backups, "--keep", "2");
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /integrity ok/);
    assert.match(result.out, /removed old backups .*nbins-20200101-000000\.db/);

    const names = readdirSync(backups).sort();
    const dbCopy = names.find((n) => /^nbins-\d{8}-\d{6}\.db$/.test(n) && !n.startsWith("nbins-2020"));
    assert.ok(dbCopy, names.join(","));
    assert.ok(names.some((n) => n.endsWith(".files.tar.gz")));
    assert.deepEqual(names.filter((n) => n.startsWith("nbins-2020")), ["nbins-20200102-000000.db"]);
    assert.equal(count(join(backups, dbCopy), "users"), count(join(dir, "nbins.db"), "users"));

    const listing = spawnSync("tar", ["-tzf", join(backups, names.find((n) => n.endsWith(".files.tar.gz")))], {
      encoding: "utf8"
    }).stdout;
    assert.match(listing, /storage\/objects\/ncrs\/n1\.json/);
  }));

test("import-d1 builds the database from a D1 export, upgrades its schema and copies bucket files", () =>
  withDataDir((dir) => {
    const exportFile = join(dir, "export.sql");
    writeFileSync(exportFile, D1_EXPORT);
    const bucket = join(dir, "r2-dump");
    mkdirSync(join(bucket, "media", "ship-1"), { recursive: true });
    writeFileSync(join(bucket, "media", "ship-1", "a.jpg"), "img");
    writeFileSync(join(bucket, "ncrs-1.json"), "{}");

    const result = runCli(dir, "import-d1", exportFile, "--objects", bucket);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /added missing column: users\.disciplines/);
    assert.match(result.out, /integrity_check: ok/);
    assert.match(result.out, /copied 2 file\(s\)/);

    const dbPath = join(dir, "nbins.db");
    assert.equal(count(dbPath, "users"), 2);
    assert.equal(count(dbPath, "projects"), 1);
    assert.equal(count(dbPath, "inspection_items"), 0, "tables missing from the export are created empty");
    const db = new LocalSqliteDatabase(dbPath, { readOnly: true });
    try {
      assert.equal(db.sqlite.prepare("SELECT displayName FROM users WHERE id='u-2'").get().displayName, "Inspector; with semicolon");
      assert.equal(db.sqlite.prepare("SELECT disciplines FROM users WHERE id='u-1'").get().disciplines, "[]");
      assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = '_cf_KV'").get().n, 0);
    } finally {
      db.close();
    }
    assert.equal(readFileSync(join(dir, "storage", "objects", "media", "ship-1", "a.jpg"), "utf8"), "img");
    assert.equal(existsSync(`${dbPath}.import-${process.pid}`), false);

    const again = runCli(dir, "import-d1", exportFile);
    assert.equal(again.code, 1);
    assert.match(again.out, /refusing/);

    const forced = runCli(dir, "import-d1", exportFile, "--force");
    assert.equal(forced.code, 0, forced.out);
    assert.match(forced.out, /database backup: /);
    assert.equal(count(dbPath, "users"), 2);
    assert.ok(readdirSync(join(dir, "backups")).some((n) => n.endsWith(".db")));
  }));

test("unknown commands and bad options fail with a usage message", () =>
  withDataDir((dir) => {
    assert.equal(runCli(dir, "frobnicate").code, 2);
    const bad = runCli(dir, "backup", "--keep");
    assert.equal(bad.code, 2);
    assert.match(bad.out, /--keep needs a value/);
  }));
