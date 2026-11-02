/**
 * nbins maintenance commands (database + files). Reads the same .env / env vars
 * as the server (src/config.ts).
 *
 *   init [--sample-data]        create/upgrade the schema; seed the initial accounts
 *                               if the database has no users (same seed the server
 *                               writes on first use). --sample-data instead loads
 *                               scripts/init-admin.sql + dummy-data*.sql (demo data).
 *   migrate                     apply pending migrations / add missing columns
 *   check                       integrity, foreign keys, migrations, row counts
 *   backup [--out DIR] [--keep N] [--no-files]
 *                               stopped-server SQLite backup + tar.gz file store,
 *                               verified with integrity_check; keeps the newest N
 *   import-d1 FILE.sql [--objects DIR] [--force]
 *                               build the database from a `wrangler d1 export` file
 *                               (and copy a downloaded bucket into the file store)
 *   import-objects DIR          copy a downloaded bucket into the file store
 *
 * Run from source:  pnpm db:<command>   (e.g. pnpm db:init, pnpm db:backup)
 * Run bundled:      node packages/api/dist/cli.mjs <command>
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import * as nodeSqlite from "node:sqlite";
import { fileURLToPath } from "node:url";
import { ConfigError, loadConfig, loadEnvFileIfPresent, type ServerConfig } from "./config.ts";
import { listAppliedMigrations, migrate, MIGRATIONS, findMissingColumns, type MigrationReport } from "./db/migrate.ts";
import { schema } from "./db/schema.ts";
import { quoteIdentifier } from "./db/sql.ts";
import { D1SeededInspectionStorage } from "./persistence/d1-seeded-inspection-storage.ts";
import { LocalSqliteDatabase } from "./platform/sqlite-database.ts";
import { acquireDataLock } from "./platform/data-lock.ts";

const SAMPLE_DATA_FILES = ["init-admin.sql", "dummy-data.sql", "dummy-data-2.sql"];

class UsageError extends Error {}

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg.startsWith("--")) {
      const [name, inline] = arg.slice(2).split("=", 2);
      if (inline !== undefined) {
        flags.set(name, inline);
      } else if (["out", "keep", "objects"].includes(name)) {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new UsageError(`--${name} needs a value`);
        }
        flags.set(name, value);
        i += 1;
      } else {
        flags.set(name, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function scriptsDir(): string {
  // src/cli.ts and dist/cli.mjs both sit one level below the package directory.
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
}

function timestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}

function printReport(report: MigrationReport): void {
  console.log(`migrations applied now: ${report.applied.length ? report.applied.join(", ") : "(none)"}`);
  console.log(`migrations already applied: ${report.alreadyApplied.length ? report.alreadyApplied.join(", ") : "(none)"}`);
  for (const fix of report.addedColumns) {
    console.log(`added missing column: ${fix.table}.${fix.column}`);
  }
  for (const name of report.addedIndexes) {
    console.log(`added missing index: ${name}`);
  }
  for (const fix of report.manualColumns) {
    console.log(`WARNING missing column needs a manual fix: ${fix.table}.${fix.column}  (${fix.sql})`);
  }
}

function openDatabase(config: ServerConfig): LocalSqliteDatabase {
  mkdirSync(dirname(config.dbPath), { recursive: true });
  return new LocalSqliteDatabase(config.dbPath);
}

function countRows(db: LocalSqliteDatabase): Array<{ table: string; rows: number | string }> {
  return Object.values(schema).map((table) => {
    try {
      const row = db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(table.name)}`).get() as { n: number };
      return { table: table.name, rows: row.n };
    } catch {
      return { table: table.name, rows: "missing" };
    }
  });
}

function userCount(db: LocalSqliteDatabase): number {
  return (db.sqlite.prepare('SELECT COUNT(*) AS n FROM "users"').get() as { n: number }).n;
}

async function commandInit(config: ServerConfig, args: ParsedArgs): Promise<void> {
  const db = openDatabase(config);
  try {
    console.log(`database: ${config.dbPath}`);
    printReport(migrate(db));
    mkdirSync(config.storageDir, { recursive: true });

    const before = userCount(db);
    if (args.flags.has("sample-data")) {
      if (before > 0) {
        console.log(`sample data skipped: the database already has ${before} user(s)`);
      } else {
        db.transaction(() => {
          for (const file of SAMPLE_DATA_FILES) {
            db.sqlite.exec(readFileSync(join(scriptsDir(), file), "utf8"));
            console.log(`loaded ${file}`);
          }
        });
      }
    } else if (before === 0) {
      // Same seed the server writes on the first request to an empty database.
      await new D1SeededInspectionStorage(db).readUserByUsername("");
      console.log(`seeded initial accounts: ${userCount(db)} user(s) (initial password 1234 - change it after first login)`);
    } else {
      console.log(`database already has ${before} user(s); nothing seeded`);
    }

    for (const { table, rows } of countRows(db)) {
      console.log(`  ${table}: ${rows}`);
    }
  } finally {
    db.close();
  }
}

function commandMigrate(config: ServerConfig): void {
  const db = openDatabase(config);
  try {
    console.log(`database: ${config.dbPath}`);
    printReport(migrate(db));
  } finally {
    db.close();
  }
}

function runChecks(db: LocalSqliteDatabase): boolean {
  const integrity = (db.sqlite.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>).map(
    (row) => row.integrity_check
  );
  const foreignKeys = db.sqlite.prepare("PRAGMA foreign_key_check").all() as Array<Record<string, unknown>>;
  const journal = (db.sqlite.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode;
  console.log(`integrity_check: ${integrity.join("; ")}`);
  console.log(`foreign_key_check: ${foreignKeys.length === 0 ? "ok" : `${foreignKeys.length} violation(s)`}`);
  for (const violation of foreignKeys.slice(0, 20)) {
    console.log(`  ${JSON.stringify(violation)}`);
  }
  console.log(`journal_mode: ${journal}`);
  return integrity.length === 1 && integrity[0] === "ok" && foreignKeys.length === 0;
}

function commandCheck(config: ServerConfig): boolean {
  if (!existsSync(config.dbPath)) {
    console.log(`database not found: ${config.dbPath} (run init first)`);
    return false;
  }
  const db = new LocalSqliteDatabase(config.dbPath);
  try {
    console.log(`database: ${config.dbPath}`);
    const ok = runChecks(db);
    const applied = new Set(listAppliedMigrations(db));
    const pending = MIGRATIONS.filter((migration) => !applied.has(migration.id)).map((migration) => migration.id);
    const missing = findMissingColumns(db);
    console.log(`pending migrations: ${pending.length ? pending.join(", ") : "(none)"}`);
    console.log(
      `missing columns: ${
        [...missing.addable, ...missing.manual].map((fix) => `${fix.table}.${fix.column}`).join(", ") || "(none)"
      }`
    );
    for (const { table, rows } of countRows(db)) {
      console.log(`  ${table}: ${rows}`);
    }
    return ok && pending.length === 0 && missing.addable.length + missing.manual.length === 0;
  } finally {
    db.close();
  }
}

type BackupFunction = (source: nodeSqlite.DatabaseSync, path: string) => Promise<number>;

async function onlineBackup(db: LocalSqliteDatabase, target: string): Promise<string> {
  const backup = (nodeSqlite as unknown as { backup?: BackupFunction }).backup;
  if (typeof backup === "function") {
    // SQLite online backup API (node:sqlite backup(), Node >= 22.16).
    await backup(db.sqlite, target);
    return "sqlite3_backup (node:sqlite backup())";
  }
  // Older Node 22: VACUUM INTO also produces a consistent snapshot while others keep writing.
  db.sqlite.prepare("VACUUM INTO ?").run(target);
  return "VACUUM INTO";
}

function pruneOldBackups(dir: string, keep: number): string[] {
  const groups = new Map<string, string[]>();
  for (const name of readdirSync(dir)) {
    const match = name.match(/^nbins-(\d{8}-\d{6})\.(db|files\.tar\.gz)$/);
    if (match) {
      groups.set(match[1], [...(groups.get(match[1]) ?? []), name]);
    }
  }
  const stamps = [...groups.keys()].sort().reverse();
  const removed: string[] = [];
  for (const stamp of stamps.slice(keep)) {
    for (const name of groups.get(stamp) ?? []) {
      rmSync(join(dir, name), { force: true });
      removed.push(name);
    }
  }
  return removed;
}

async function commandBackup(config: ServerConfig, args: ParsedArgs): Promise<boolean> {
  if (!existsSync(config.dbPath)) {
    console.log(`database not found: ${config.dbPath}`);
    return false;
  }
  const outDir = resolve(String(args.flags.get("out") ?? config.backupDir));
  const keepText = String(args.flags.get("keep") ?? "14");
  const keep = Number(keepText);
  if (!Number.isInteger(keep) || keep < 1) {
    throw new UsageError(`--keep must be a positive integer, got ${keepText}`);
  }
  mkdirSync(outDir, { recursive: true });

  // Never overwrite an earlier recovery point when commands finish within
  // one second (notably repeated forced imports).
  let instant = Date.now();
  let stamp = timestamp(new Date(instant));
  while (["db", "files.tar.gz", "db.partial"].some((suffix) => existsSync(join(outDir, `nbins-${stamp}.${suffix}`)))) {
    stamp = timestamp(new Date(instant += 1000));
  }
  const dbTarget = join(outDir, `nbins-${stamp}.db`);
  const tmpTarget = `${dbTarget}.partial`;
  rmSync(tmpTarget, { force: true });

  const db = new LocalSqliteDatabase(config.dbPath);
  let method: string;
  try {
    method = await onlineBackup(db, tmpTarget);
  } finally {
    db.close();
  }

  const copy = new LocalSqliteDatabase(tmpTarget, { readOnly: true });
  let integrity: string;
  try {
    integrity = (copy.sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
  } finally {
    copy.close();
  }
  if (integrity !== "ok") {
    console.log(`backup FAILED integrity_check: ${integrity}; kept as ${tmpTarget}`);
    return false;
  }
  renameSync(tmpTarget, dbTarget);
  console.log(`database backup: ${dbTarget} (${statSync(dbTarget).size} bytes, ${method}, integrity ok)`);

  if (!args.flags.has("no-files") && existsSync(config.storageDir)) {
    const filesTarget = join(outDir, `nbins-${stamp}.files.tar.gz`);
    const result = spawnSync("tar", ["-czf", filesTarget, "-C", dirname(config.storageDir), basename(config.storageDir)], {
      encoding: "utf8"
    });
    if (result.status !== 0) {
      console.log(`file store backup FAILED: ${result.stderr || result.error?.message}`);
      return false;
    }
    console.log(`file store backup: ${filesTarget} (${statSync(filesTarget).size} bytes)`);
  }

  const removed = pruneOldBackups(outDir, keep);
  if (removed.length) {
    console.log(`removed old backups (keeping newest ${keep}): ${removed.join(", ")}`);
  }
  return true;
}

function copyObjects(sourceDir: string, storageDir: string): number {
  const source = resolve(sourceDir);
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new UsageError(`objects directory not found: ${source}`);
  }
  const target = join(storageDir, "objects");
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true, force: true });

  let files = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        files += 1;
      }
    }
  };
  walk(source);
  return files;
}

function hasUserData(dbPath: string): boolean {
  if (!existsSync(dbPath)) {
    return false;
  }
  const db = new LocalSqliteDatabase(dbPath, { readOnly: true });
  try {
    return countRows(db).some(({ rows }) => typeof rows === "number" && rows > 0);
  } finally {
    db.close();
  }
}

function removeDatabaseFiles(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${path}${suffix}`, { force: true });
  }
}

async function commandImportD1(config: ServerConfig, args: ParsedArgs): Promise<boolean> {
  const file = args.positional[0];
  if (!file) {
    throw new UsageError("usage: import-d1 <wrangler-d1-export.sql> [--objects <dir>] [--force]");
  }
  const exportPath = resolve(file);
  const sql = readFileSync(exportPath, "utf8");

  if (hasUserData(config.dbPath)) {
    if (!args.flags.has("force")) {
      console.log(`refusing: ${config.dbPath} already contains data. Re-run with --force to replace it (a backup is made first).`);
      return false;
    }
    const ok = await commandBackup(config, parseArgs(["--keep", "1000"]));
    if (!ok) {
      return false;
    }
  }

  const tmpPath = `${config.dbPath}.import-${process.pid}`;
  removeDatabaseFiles(tmpPath);
  mkdirSync(dirname(config.dbPath), { recursive: true });

  const db = new LocalSqliteDatabase(tmpPath);
  let ok = false;
  try {
    // The export contains its own CREATE TABLE statements (the production schema)
    // and INSERTs in table order; foreign keys are checked after loading.
    db.sqlite.exec("PRAGMA foreign_keys = OFF;");
    // The temporary database is not activated on failure. Let SQLite parse the
    // dump's own transactions; never rewrite SQL text inside string literals.
    db.sqlite.exec(sql);
    for (const internal of ["_cf_KV", "_cf_METADATA", "d1_migrations"]) {
      db.sqlite.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(internal)};`);
    }
    db.sqlite.exec("PRAGMA foreign_keys = ON;");
    console.log(`imported ${exportPath}`);
    printReport(migrate(db));
    ok = runChecks(db);
    for (const { table, rows } of countRows(db)) {
      console.log(`  ${table}: ${rows}`);
    }
  } finally {
    db.close();
  }

  if (!ok) {
    console.log(`import checks failed; the imported database was left at ${tmpPath} for inspection (not activated).`);
    return false;
  }

  removeDatabaseFiles(config.dbPath);
  renameSync(tmpPath, config.dbPath);
  removeDatabaseFiles(tmpPath);
  console.log(`database activated: ${config.dbPath}`);

  const objects = args.flags.get("objects");
  if (typeof objects === "string") {
    console.log(`copied ${copyObjects(objects, config.storageDir)} file(s) into ${join(config.storageDir, "objects")}`);
  }
  return true;
}

function usage(): string {
  return [
    "usage: cli <command> [options]",
    "  init [--sample-data]",
    "  migrate",
    "  check",
    "  backup [--out DIR] [--keep N] [--no-files]",
    "  import-d1 FILE.sql [--objects DIR] [--force]",
    "  import-objects DIR"
  ].join("\n");
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv.filter((arg) => arg !== "--");
  const args = parseArgs(rest);
  loadEnvFileIfPresent();
  const config = loadConfig();

  const releaseDataLock = ["init", "migrate", "check", "backup", "import-d1", "import-objects"].includes(command)
    ? acquireDataLock(config.dbPath, config.storageDir, command)
    : () => {};
  // Hold ownership through every await, database snapshot and object copy.
  // SIGINT/SIGTERM release before exiting so Ctrl+C leaves no stale lock;
  // SIGKILL cannot run handlers, which is why acquireDataLock reclaims locks
  // whose owner PID is gone.
  process.once("exit", releaseDataLock);
  const releaseOnSignal = (signal: NodeJS.Signals) => {
    releaseDataLock();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", releaseOnSignal);
  process.once("SIGTERM", releaseOnSignal);
  try {
  switch (command) {
    case "init":
      await commandInit(config, args);
      return 0;
    case "migrate":
      commandMigrate(config);
      return 0;
    case "check":
      return commandCheck(config) ? 0 : 1;
    case "backup":
      return (await commandBackup(config, args)) ? 0 : 1;
    case "import-d1":
      return (await commandImportD1(config, args)) ? 0 : 1;
    case "import-objects": {
      if (!args.positional[0]) {
        throw new UsageError("usage: import-objects <dir>");
      }
      console.log(`copied ${copyObjects(args.positional[0], config.storageDir)} file(s) into ${join(config.storageDir, "objects")}`);
      return 0;
    }
    default:
      console.log(usage());
      return command ? 2 : 0;
  }
  } finally {
    releaseDataLock();
    process.removeListener("exit", releaseDataLock);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    if (error instanceof UsageError || error instanceof ConfigError) {
      console.error(error.message);
      process.exit(2);
    }
    console.error(error);
    process.exit(1);
  }
);
