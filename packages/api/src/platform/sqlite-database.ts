/**
 * LocalSqliteDatabase: the production SqlDatabase, backed by a single SQLite
 * file through Node's built-in `node:sqlite` module (Node >= 22.13).
 *
 * Why node:sqlite and not better-sqlite3: it ships with Node, so a server needs
 * no compiler, no prebuilt native binary download and no pnpm build approval;
 * it is the same engine the API test-suite already ran on; and the API is
 * synchronous-per-statement either way (both libraries are synchronous). The
 * module still prints an ExperimentalWarning on Node 22/24; `pnpm start`
 * silences that one warning.
 *
 * Connection settings (applied on open):
 * - journal_mode = WAL       readers never block the writer (file databases)
 * - busy_timeout = 5000 ms   wait for a lock instead of failing at once
 * - foreign_keys = ON        enforce the REFERENCES in the schema
 * - synchronous  = NORMAL    safe with WAL, much faster than FULL
 *
 * batch() runs inside BEGIN IMMEDIATE ... COMMIT, so a batch is atomic, like
 * the D1 batches the storage code was written for.
 */
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { SqlDatabase, SqlExecResult, SqlResult, SqlStatement } from "./sql-database.ts";

export interface LocalSqliteOptions {
  /** Milliseconds to wait for a lock held by another connection. Default 5000. */
  busyTimeoutMs?: number;
  /** Open read-only (backups, checks). Default false. */
  readOnly?: boolean;
}

const ROW_RETURNING_KEYWORDS = new Set(["SELECT", "WITH", "PRAGMA", "VALUES", "EXPLAIN"]);
const STATEMENT_CACHE_LIMIT = 256;

export function leadingKeyword(sql: string): string {
  const stripped = sql.replace(/^(\s|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)+/, "");
  return stripped.split(/[\s(]+/, 1)[0]?.toUpperCase() ?? "";
}

function returnsRows(sql: string): boolean {
  return ROW_RETURNING_KEYWORDS.has(leadingKeyword(sql)) || /\bRETURNING\b/i.test(sql);
}

export function normalizeSqlParam(value: unknown, index: number): unknown {
  if (value === undefined) {
    throw new TypeError(`SQL_TYPE_ERROR: Type 'undefined' not supported for value at index ${index}`);
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return value;
}

function toPlainRow(row: unknown): Record<string, unknown> {
  return { ...(row as Record<string, unknown>) };
}

class LocalSqliteStatement implements SqlStatement {
  readonly #db: LocalSqliteDatabase;
  readonly #sql: string;
  readonly #params: unknown[];

  constructor(db: LocalSqliteDatabase, sql: string, params: unknown[] = []) {
    this.#db = db;
    this.#sql = sql;
    this.#params = params;
  }

  bind(...values: unknown[]): SqlStatement {
    return new LocalSqliteStatement(this.#db, this.#sql, values.map(normalizeSqlParam));
  }

  async all<T = Record<string, unknown>>(): Promise<SqlResult<T>> {
    return this.#db._execute(this.#sql, this.#params) as SqlResult<T>;
  }

  async run<T = Record<string, unknown>>(): Promise<SqlResult<T>> {
    return this.#db._execute(this.#sql, this.#params) as SqlResult<T>;
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const { results } = this.#db._execute(this.#sql, this.#params);
    const row = results[0] ?? null;

    if (columnName === undefined) {
      return row as T | null;
    }

    if (!row) {
      return null;
    }

    if (!(columnName in row)) {
      throw new Error(`SQL_COLUMN_NOTFOUND: Column not found (${columnName})`);
    }

    return row[columnName] as T;
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const { results } = this.#db._execute(this.#sql, this.#params);
    return results.map((row) => Object.values(row)) as T[];
  }

  /** Used by batch(): execute synchronously inside the open transaction. */
  _executeSync(): SqlResult {
    return this.#db._execute(this.#sql, this.#params);
  }
}

export class LocalSqliteDatabase implements SqlDatabase {
  readonly sqlite: DatabaseSync;
  readonly path: string;
  readonly #statementCache = new Map<string, StatementSync>();
  #closed = false;

  constructor(path: string, options: LocalSqliteOptions = {}) {
    this.path = path;
    this.sqlite = new DatabaseSync(path, { readOnly: options.readOnly ?? false });
    this.sqlite.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.busyTimeoutMs ?? 5000))};`);
    this.sqlite.exec("PRAGMA foreign_keys = ON;");

    if (!options.readOnly && path !== ":memory:" && path !== "") {
      this.sqlite.exec("PRAGMA journal_mode = WAL;");
      this.sqlite.exec("PRAGMA synchronous = NORMAL;");
    }
  }

  prepare(sql: string): SqlStatement {
    return new LocalSqliteStatement(this, sql);
  }

  async batch<T = Record<string, unknown>>(statements: SqlStatement[]): Promise<SqlResult<T>[]> {
    this.sqlite.exec("BEGIN IMMEDIATE");

    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof LocalSqliteStatement)) {
          throw new TypeError("batch() only accepts statements prepared on the same database");
        }
        return statement._executeSync();
      });
      this.sqlite.exec("COMMIT");
      return results as SqlResult<T>[];
    } catch (error) {
      this.#rollbackQuietly();
      throw error;
    }
  }

  async exec(sql: string): Promise<SqlExecResult> {
    const started = performance.now();
    this.sqlite.exec(sql);
    return {
      count: sql.split(";").filter((part) => part.trim()).length,
      duration: performance.now() - started
    };
  }

  /** Run `fn` inside one write transaction (used by init/import tools). */
  transaction<T>(fn: () => T): T {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.#rollbackQuietly();
      throw error;
    }
  }

  close(): void {
    this.#statementCache.clear();
    if (!this.#closed) {
      this.#closed = true;
      this.sqlite.close();
    }
  }

  #rollbackQuietly(): void {
    try {
      this.sqlite.exec("ROLLBACK");
    } catch {
      // No transaction open any more (SQLite already rolled back): nothing to undo.
    }
  }

  #statement(sql: string): StatementSync {
    let statement = this.#statementCache.get(sql);
    if (statement) {
      // Refresh LRU position.
      this.#statementCache.delete(sql);
      this.#statementCache.set(sql, statement);
      return statement;
    }

    statement = this.sqlite.prepare(sql);
    this.#statementCache.set(sql, statement);
    if (this.#statementCache.size > STATEMENT_CACHE_LIMIT) {
      const oldest = this.#statementCache.keys().next().value;
      if (oldest !== undefined) {
        this.#statementCache.delete(oldest);
      }
    }
    return statement;
  }

  /** Execute one statement. Subclasses (test support) may wrap this to log SQL. */
  _execute(sql: string, params: unknown[]): SqlResult {
    const started = performance.now();
    const statement = this.#statement(sql);

    if (returnsRows(sql)) {
      const results = statement.all(...(params as never[])).map(toPlainRow);
      // Only a write with RETURNING changes rows here; plain reads report 0.
      const changes = /\bRETURNING\b/i.test(sql) && !ROW_RETURNING_KEYWORDS.has(leadingKeyword(sql))
        ? Number((this.sqlite.prepare("SELECT changes() AS c").get() as { c: number } | undefined)?.c ?? 0)
        : 0;
      return {
        success: true,
        results,
        meta: {
          changes,
          last_row_id: 0,
          duration: performance.now() - started,
          rows_read: results.length,
          rows_written: changes
        }
      };
    }

    const info = statement.run(...(params as never[]));
    const changes = Number(info.changes);
    return {
      success: true,
      results: [],
      meta: {
        changes,
        last_row_id: Number(info.lastInsertRowid),
        duration: performance.now() - started,
        rows_read: 0,
        rows_written: changes
      }
    };
  }
}

export function openSqliteDatabase(path: string, options?: LocalSqliteOptions): LocalSqliteDatabase {
  return new LocalSqliteDatabase(path, options);
}
