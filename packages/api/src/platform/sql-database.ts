/**
 * The SQL database contract the API code is written against.
 *
 * It is the small async prepare/bind/all/first/run/raw/batch surface the code
 * has always used (originally modelled on Cloudflare D1), now owned by this
 * repository so nothing depends on Cloudflare packages. The production
 * implementation is LocalSqliteDatabase (./sqlite-database.ts, node:sqlite on a
 * single file); tests use the same class on an in-memory database.
 *
 * Semantics every implementation must keep:
 * - bind() rejects `undefined`; booleans are stored as 0/1.
 * - batch() runs all statements in ONE transaction: all succeed or none apply.
 * - run() reports meta.changes / meta.last_row_id.
 */

export interface SqlResultMeta {
  changes: number;
  last_row_id: number;
  duration: number;
  rows_read: number;
  rows_written: number;
}

export interface SqlResult<T = Record<string, unknown>> {
  success: true;
  results: T[];
  meta: SqlResultMeta;
}

export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  all<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface SqlExecResult {
  count: number;
  duration: number;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch<T = Record<string, unknown>>(statements: SqlStatement[]): Promise<SqlResult<T>[]>;
  exec(sql: string): Promise<SqlExecResult>;
}
