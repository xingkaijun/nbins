import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireDataLock } from "./platform/data-lock.ts";
import { LocalSqliteDatabase } from "./platform/sqlite-database.ts";

const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
const smoke = fileURLToPath(new URL("../../../scripts/smoke-local.sh", import.meta.url));
/** native path → the POSIX form bash reports (C:\x becomes /c/x). */
const toPosix = (path) =>
  path.startsWith("/") ? path : `/` + path[0].toLowerCase() + path.slice(2).replace(/\\/g, "/");
function run(dir, ...args) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", cli, ...args], {
    cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, NBINS_DATA_DIR: dir }
  });
}
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "nbins-safety-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("server ownership blocks backup/import and failed acquisition releases other locks", () => fixture((dir) => {
  assert.equal(run(dir, "init").status, 0);
  const release = acquireDataLock(join(dir, "nbins.db"), join(dir, "storage"), "server");
  try {
    for (const args of [["backup"], ["import-d1", "missing.sql", "--force"], ["import-objects", "missing"]]) {
      const result = run(dir, ...args);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /DATA_LOCKED/);
    }
    assert.throws(() => acquireDataLock(join(dir, "other.db"), join(dir, "storage"), "backup"), /DATA_LOCKED/);
    assert.equal(existsSync(join(dir, "other.db.nbins-lock")), false);
  } finally { release(); }
  assert.equal(run(dir, "backup").status, 0);
  assert.equal(existsSync(join(dir, "nbins.db.nbins-lock")), false);
}));

test("a lock left by a dead process is reclaimed instead of blocking every command", () => fixture((dir) => {
  assert.equal(run(dir, "init").status, 0);
  // Simulate a hard kill: the lock directory survives, its owner PID is gone.
  const deadPid = 2 ** 22 - 1; // above the Linux default pid_max
  for (const lock of ["nbins.db.nbins-lock", "storage.nbins-lock"]) {
    mkdirSync(join(dir, lock), { recursive: true });
    writeFileSync(join(dir, lock, "owner.json"), JSON.stringify({
      token: "dead", pid: deadPid, operation: "starting the server", startedAt: "2026-11-01T05:45:24.663Z"
    }));
  }
  const backup = run(dir, "backup");
  assert.equal(backup.status, 0, backup.stdout + backup.stderr);
  assert.match(backup.stderr, /Reclaimed stale data lock/);
  assert.equal(existsSync(join(dir, "nbins.db.nbins-lock")), false, "lock removed after the command finished");
  assert.equal(existsSync(join(dir, "storage.nbins-lock")), false);
}));

test("a lock held by a live process is never reclaimed", () => fixture((dir) => {
  assert.equal(run(dir, "init").status, 0);
  // The test runner itself is alive, so its lock must stay off limits.
  for (const lock of ["nbins.db.nbins-lock", "storage.nbins-lock"]) {
    mkdirSync(join(dir, lock), { recursive: true });
    writeFileSync(join(dir, lock, "owner.json"), JSON.stringify({
      token: "live", pid: process.pid, operation: "server", startedAt: new Date().toISOString()
    }));
  }
  const backup = run(dir, "backup");
  assert.equal(backup.status, 1, backup.stdout + backup.stderr);
  assert.match(backup.stderr, /DATA_LOCKED/);
  assert.equal(existsSync(join(dir, "nbins.db.nbins-lock")), true, "live owner's lock is left in place");
}));

test("database and storage aliases cannot bypass data ownership", () => fixture((dir) => {
  mkdirSync(join(dir, "real"));
  symlinkSync(join(dir, "real"), join(dir, "alias"), "dir");
  const release = acquireDataLock(join(dir, "real", "db"), join(dir, "real", "files"), "server");
  try {
    assert.throws(() => acquireDataLock(join(dir, "alias", "db"), join(dir, "alias", "files"), "backup"), /DATA_LOCKED/);
  } finally { release(); }
}));

test("forced import preserves the old object body in a matching files backup", () => fixture((dir) => {
  assert.equal(run(dir, "init").status, 0);
  const oldBody = "ORIGINAL NCR BODY";
  mkdirSync(join(dir, "storage", "objects", "ncrs"), { recursive: true });
  writeFileSync(join(dir, "storage", "objects", "ncrs", "n1.json"), oldBody);
  const incoming = join(dir, "incoming");
  mkdirSync(join(incoming, "ncrs"), { recursive: true });
  writeFileSync(join(incoming, "ncrs", "n1.json"), "OLDER IMPORT BODY");
  const dump = join(dir, "dump.sql");
  writeFileSync(dump, "CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, displayName TEXT NOT NULL, passwordHash TEXT NOT NULL, role TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);\nINSERT INTO users VALUES ('u','u','U','hash','admin','2026-01-01','2026-01-01');\n");
  const result = run(dir, "import-d1", dump, "--objects", incoming, "--force");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const archive = readdirSync(join(dir, "backups")).find((name) => name.endsWith(".files.tar.gz"));
  assert.ok(archive, "full files backup must exist before overwriting objects");
  // Archive named relative to its own directory: MSYS tar reads an absolute
  // `C:\...` -f value as a remote host.
  const original = spawnSync("tar", ["-xOzf", archive, "storage/objects/ncrs/n1.json"], {
    cwd: join(dir, "backups"),
    encoding: "utf8"
  });
  assert.equal(original.status, 0, original.stderr);
  assert.equal(original.stdout, oldBody);
  assert.equal(readFileSync(join(dir, "storage", "objects", "ncrs", "n1.json"), "utf8"), "OLDER IMPORT BODY");
}));

test("import preserves BEGIN/COMMIT lines inside SQL strings and accepts dump transactions", () => fixture((dir) => {
  const body = "Deck issue\nBEGIN;\nRepair started\nCOMMIT;\nDone";
  const dump = join(dir, "dump.sql");
  writeFileSync(dump, `BEGIN TRANSACTION;\nCREATE TABLE notes (body TEXT);\nINSERT INTO notes VALUES ('${body}');\nCOMMIT;\n`);
  const result = run(dir, "import-d1", dump);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const db = new LocalSqliteDatabase(join(dir, "nbins.db"), { readOnly: true });
  try { assert.equal(db.sqlite.prepare("SELECT body FROM notes").get().body, body); }
  finally { db.close(); }
}));

test("forced import refuses failed foreign-key checks and preserves the active database", () => fixture((dir) => {
  assert.equal(run(dir, "init").status, 0);
  const dump = join(dir, "invalid.sql");
  writeFileSync(dump, "CREATE TABLE parent (id TEXT PRIMARY KEY);\nCREATE TABLE child (parentId TEXT REFERENCES parent(id));\nINSERT INTO child VALUES ('missing');\n");
  const result = run(dir, "import-d1", dump, "--force");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /import checks failed/);
  const db = new LocalSqliteDatabase(join(dir, "nbins.db"), { readOnly: true });
  try { assert.ok(db.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0); }
  finally { db.close(); }
}));

test("smoke setup overrides inherited concrete paths without reading runtime env", () => fixture((dir) => {
  const setup = readFileSync(smoke, "utf8").split("\nFAIL=0")[0].replace(/\r\n/g, "\n");
  // Hand the script a POSIX work dir: it is a bash script, and on Windows a
  // native `C:\...` value comes back with mixed separators in its output.
  const work = toPosix(dir);
  const sentinel = join(dir, "production");
  mkdirSync(sentinel);
  writeFileSync(join(sentinel, "keep"), "untouched");
  const result = spawnSync("bash", ["-c", `${setup}\nprintf '\\nCHECK:%s|%s|%s|%s\\n' "$NBINS_ENV_FILE" "$NBINS_DB_PATH" "$NBINS_STORAGE_DIR" "$NBINS_BACKUP_DIR"`], {
    cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, WORK: work, PORT: "0", NBINS_DB_PATH: join(sentinel, "db"), NBINS_STORAGE_DIR: sentinel, NBINS_BACKUP_DIR: sentinel, NBINS_ENV_FILE: join(sentinel, "missing.env") }
  });
  assert.equal(result.status, 0, result.stderr);
  const paths = result.stdout.match(/CHECK:(.*)/)[1].split("|");
  const prefix = `${work}/nbins-smoke.`;
  assert.ok(paths.every((path) => path.startsWith(prefix)), result.stdout);
  assert.equal(readFileSync(join(sentinel, "keep"), "utf8"), "untouched");
}));
