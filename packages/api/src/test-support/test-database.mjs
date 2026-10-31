/**
 * Test database: the production LocalSqliteDatabase (src/platform/sqlite-database.ts,
 * node:sqlite) on an in-memory SQLite, created from the real schema
 * (src/db/bootstrap.sql). Route and storage tests therefore run the real SQL the
 * storage layer emits through the same adapter the server uses.
 *
 * Inspection helpers for assertions:
 * - executedSql: every read statement (SELECT / WITH), in order
 * - insertedTables / updatedTables / deletedTables: table of every write
 * - tables: live rows per table (arrays still JSON text, as stored)
 * - clearLog(): forget the above after seeding
 *
 * Requires Node.js with node:sqlite and TypeScript type stripping (22.13+ with
 * --experimental-strip-types, as the test script passes).
 */
import { readFileSync } from "node:fs";
import { LocalSqliteDatabase, leadingKeyword, normalizeSqlParam } from "../platform/sqlite-database.ts";

const BOOTSTRAP_SQL = readFileSync(new URL("../db/bootstrap.sql", import.meta.url), "utf8");

/** Snapshot key -> table name, as used by D1InspectionStorage. */
const SNAPSHOT_TABLES = [
  ["users", "users"],
  ["projects", "projects"],
  ["projectMembers", "project_members"],
  ["ships", "ships"],
  ["inspectionItems", "inspection_items"],
  ["inspectionRounds", "inspection_rounds"],
  ["comments", "comments"],
  ["ncrs", "ncrs"],
  ["observationTypes", "observation_types"],
  ["observations", "observations"]
];

function writtenTable(sql) {
  const match =
    sql.match(/^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+"?([A-Za-z_]+)"?/i) ??
    sql.match(/^\s*UPDATE\s+"?([A-Za-z_]+)"?/i) ??
    sql.match(/^\s*DELETE\s+FROM\s+"?([A-Za-z_]+)"?/i);

  return match ? match[1] : null;
}

export class TestSqliteDatabase extends LocalSqliteDatabase {
  constructor() {
    super(":memory:");
    // The same schema file production uses (src/db/bootstrap.sql = migration 0001_baseline).
    this.sqlite.exec(BOOTSTRAP_SQL);
    this.clearLog();
  }

  clearLog() {
    this.executedSql = [];
    this.insertedTables = [];
    this.updatedTables = [];
    this.deletedTables = [];
  }

  /** Wraps the production statement executor to record what ran. */
  _execute(sql, params) {
    const keyword = leadingKeyword(sql);
    const result = super._execute(sql, params);

    if (keyword === "SELECT" || keyword === "WITH") {
      this.executedSql.push(sql);
    } else if (keyword === "INSERT" || keyword === "REPLACE") {
      this.insertedTables.push(writtenTable(sql));
    } else if (keyword === "UPDATE") {
      this.updatedTables.push(writtenTable(sql));
    } else if (keyword === "DELETE") {
      this.deletedTables.push(writtenTable(sql));
    }

    return result;
  }

  /** Live rows of every table, as stored (JSON columns stay text). */
  get tables() {
    const names = this.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name);

    return Object.fromEntries(
      names.map((name) => [name, this.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map((row) => ({ ...row }))])
    );
  }

  columnsOf(table) {
    return this.sqlite.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name);
  }

  /**
   * Insert a storage snapshot (records.ts shapes) straight into the tables.
   * Arrays/objects are stored as JSON text, the way the storage layer writes them.
   * Only columns that exist in the real schema are written.
   */
  seed(snapshot) {
    this.sqlite.exec("BEGIN");

    try {
      for (const [key, table] of SNAPSHOT_TABLES) {
        const records = snapshot[key] ?? [];
        const columns = new Set(this.columnsOf(table));

        for (const record of records) {
          const entries = Object.entries(record).filter(([column]) => columns.has(column));
          const sql = `INSERT INTO "${table}" (${entries.map(([column]) => `"${column}"`).join(", ")}) VALUES (${entries
            .map(() => "?")
            .join(", ")})`;
          const values = entries.map(([, value]) =>
            value !== null && typeof value === "object" ? JSON.stringify(value) : normalizeSqlParam(value, 0)
          );
          this.sqlite.prepare(sql).run(...values);
        }
      }

      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }

    this.clearLog();
    return this;
  }
}

export function createTestDatabase(snapshot) {
  const db = new TestSqliteDatabase();
  return snapshot ? db.seed(snapshot) : db;
}

/** Bindings for app.request(..., env): the real database adapter on an in-memory SQLite. */
export function createTestEnv(snapshot, extra = {}) {
  return { DB: createTestDatabase(snapshot), ...extra };
}
