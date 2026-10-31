/**
 * Test-only D1 database backed by an in-memory SQLite (node:sqlite).
 *
 * Why: the API is D1-only since the legacy mock storage was removed
 * (commit 84b37ac "彻底移除了遗留 Mock 存储基础设施"), so route and storage tests
 * must run against a D1 binding. Instead of hand-written regex fakes, this runs
 * the real schema (src/db/d1-bootstrap.sql, the same file used to bootstrap
 * local/remote D1) and the real SQL the storage layer emits.
 *
 * It implements the subset of the Cloudflare D1 API the code uses:
 * prepare().bind().all()/first()/run()/raw(), batch() (atomic, like D1) and
 * exec(). Parameter rules follow D1: `undefined` is rejected, booleans are
 * stored as 0/1.
 *
 * Inspection helpers for assertions:
 * - executedSql: every read statement (SELECT / WITH), in order
 * - insertedTables / updatedTables / deletedTables: table of every write
 * - tables: live rows per table (arrays still JSON text, as stored)
 * - clearLog(): forget the above after seeding
 *
 * Requires Node.js with node:sqlite (22.13+ / 23.4+), same as the rest of the
 * API test suite which already relies on built-in TypeScript type stripping.
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const BOOTSTRAP_SQL = readFileSync(new URL("../db/d1-bootstrap.sql", import.meta.url), "utf8");

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

function normalizeParam(value, index) {
  if (value === undefined) {
    throw new TypeError(`D1_TYPE_ERROR: Type 'undefined' not supported for value at index ${index}`);
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return value;
}

function toPlainRow(row) {
  return row ? { ...row } : row;
}

function leadingKeyword(sql) {
  return sql.replace(/^(\s|--[^\n]*\n)+/, "").split(/\s+/, 1)[0]?.toUpperCase() ?? "";
}

function writtenTable(sql) {
  const match =
    sql.match(/^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+"?([A-Za-z_]+)"?/i) ??
    sql.match(/^\s*UPDATE\s+"?([A-Za-z_]+)"?/i) ??
    sql.match(/^\s*DELETE\s+FROM\s+"?([A-Za-z_]+)"?/i);

  return match ? match[1] : null;
}

class SqliteD1PreparedStatement {
  #db;
  #sql;
  #params;

  constructor(db, sql, params = []) {
    this.#db = db;
    this.#sql = sql;
    this.#params = params;
  }

  bind(...params) {
    return new SqliteD1PreparedStatement(this.#db, this.#sql, params.map(normalizeParam));
  }

  async all() {
    return this.#db._execute(this.#sql, this.#params);
  }

  async run() {
    return this.#db._execute(this.#sql, this.#params);
  }

  async first(columnName) {
    const { results } = this.#db._execute(this.#sql, this.#params);
    const row = results[0] ?? null;

    if (columnName === undefined) {
      return row;
    }

    if (!row) {
      return null;
    }

    if (!(columnName in row)) {
      throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${columnName})`);
    }

    return row[columnName];
  }

  async raw() {
    const { results } = this.#db._execute(this.#sql, this.#params);
    return results.map((row) => Object.values(row));
  }

  /** Used by batch(): execute synchronously inside the open transaction. */
  _executeSync() {
    return this.#db._execute(this.#sql, this.#params);
  }
}

export class SqliteD1Database {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.sqlite.exec(BOOTSTRAP_SQL);
    this.clearLog();
  }

  clearLog() {
    this.executedSql = [];
    this.insertedTables = [];
    this.updatedTables = [];
    this.deletedTables = [];
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this, sql);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN");

    try {
      const results = statements.map((statement) => statement._executeSync());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: sql.split(";").filter((part) => part.trim()).length, duration: 0 };
  }

  _execute(sql, params) {
    const keyword = leadingKeyword(sql);
    const statement = this.sqlite.prepare(sql);

    if (keyword === "SELECT" || keyword === "WITH" || keyword === "PRAGMA") {
      if (keyword !== "PRAGMA") {
        this.executedSql.push(sql);
      }

      const results = statement.all(...params).map(toPlainRow);
      return { success: true, results, meta: { changes: 0, last_row_id: 0, rows_read: results.length, rows_written: 0 } };
    }

    const info = statement.run(...params);
    const table = writtenTable(sql);

    if (keyword === "INSERT" || keyword === "REPLACE") {
      this.insertedTables.push(table);
    } else if (keyword === "UPDATE") {
      this.updatedTables.push(table);
    } else if (keyword === "DELETE") {
      this.deletedTables.push(table);
    }

    return {
      success: true,
      results: [],
      meta: {
        changes: Number(info.changes),
        last_row_id: Number(info.lastInsertRowid),
        rows_read: 0,
        rows_written: Number(info.changes)
      }
    };
  }

  /** Live rows of every table, as stored (JSON columns stay text). */
  get tables() {
    const names = this.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name);

    return Object.fromEntries(
      names.map((name) => [name, this.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map(toPlainRow)])
    );
  }

  columnsOf(table) {
    return this.sqlite.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name);
  }

  /**
   * Insert a storage snapshot (records.ts shapes) straight into the tables.
   * Arrays/objects are stored as JSON text, the way D1InspectionStorage writes them.
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
            value !== null && typeof value === "object" ? JSON.stringify(value) : normalizeParam(value, 0)
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

export function createSqliteD1(snapshot) {
  const db = new SqliteD1Database();
  return snapshot ? db.seed(snapshot) : db;
}

/** Bindings for app.request(..., env): real D1 driver on an in-memory SQLite. */
export function createSqliteD1Env(snapshot, extra = {}) {
  return { D1_DRIVER: "d1", DB: createSqliteD1(snapshot), ...extra };
}
