/**
 * Local schema migrations for the SQLite database.
 *
 * - Applied migrations are recorded in `schema_migrations` (id, appliedAt).
 * - Each migration runs in its own transaction; a failure rolls it back and
 *   stops, leaving earlier migrations applied.
 * - After the migrations, `reconcileColumns` adds any column that schema.ts
 *   defines but the database lacks. This matters for a database imported from
 *   an older production export, whose tables may predate later ALTER TABLE
 *   scripts. It never drops or changes existing columns.
 *
 * Everything here is idempotent: running it again on an up-to-date database
 * changes nothing. Add a new migration by appending to MIGRATIONS with the next
 * id; never edit or reorder one that has shipped.
 */
import type { LocalSqliteDatabase } from "../platform/sqlite-database.ts";
import { schema } from "./schema.ts";
import { columnDefinitionSql, quoteIdentifier, schemaStatements } from "./sql.ts";

export interface Migration {
  id: string;
  description: string;
  up(db: LocalSqliteDatabase): void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: "0001_baseline",
    description: "Baseline schema: all tables and indexes from src/db/sql.ts (same as src/db/bootstrap.sql)",
    up(db) {
      for (const statement of schemaStatements) {
        db.sqlite.exec(statement);
      }
    }
  }
];

export interface ColumnFix {
  table: string;
  column: string;
  sql: string;
}

export interface MigrationReport {
  applied: string[];
  alreadyApplied: string[];
  addedColumns: ColumnFix[];
  /** Columns that could not be added automatically (NOT NULL without DEFAULT). */
  manualColumns: ColumnFix[];
}

function ensureMigrationsTable(db: LocalSqliteDatabase): void {
  db.sqlite.exec(
    'CREATE TABLE IF NOT EXISTS "schema_migrations" ("id" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL);'
  );
}

export function listAppliedMigrations(db: LocalSqliteDatabase): string[] {
  ensureMigrationsTable(db);
  return (db.sqlite.prepare('SELECT "id" FROM "schema_migrations" ORDER BY "id"').all() as Array<{ id: string }>).map(
    (row) => row.id
  );
}

function existingColumns(db: LocalSqliteDatabase, table: string): Set<string> {
  const rows = db.sqlite.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

/** Columns defined in schema.ts but missing from the database. */
export function findMissingColumns(db: LocalSqliteDatabase): { addable: ColumnFix[]; manual: ColumnFix[] } {
  const addable: ColumnFix[] = [];
  const manual: ColumnFix[] = [];

  for (const table of Object.values(schema)) {
    const present = existingColumns(db, table.name);
    if (present.size === 0) {
      continue; // table missing entirely: the baseline migration creates it
    }

    for (const [columnName, column] of Object.entries(table.columns)) {
      if (present.has(columnName)) {
        continue;
      }

      const sql = `ALTER TABLE ${quoteIdentifier(table.name)} ADD COLUMN ${columnDefinitionSql(columnName, column, {
        forAddColumn: true
      })};`;
      const fix = { table: table.name, column: columnName, sql };
      const notNullWithoutDefault = !column.nullable && !column.primaryKey && column.default === undefined;
      if (notNullWithoutDefault || column.primaryKey || column.unique) {
        manual.push(fix);
      } else {
        addable.push(fix);
      }
    }
  }

  return { addable, manual };
}

export function migrate(db: LocalSqliteDatabase, now: () => string = () => new Date().toISOString()): MigrationReport {
  ensureMigrationsTable(db);
  const done = new Set(listAppliedMigrations(db));
  const report: MigrationReport = { applied: [], alreadyApplied: [], addedColumns: [], manualColumns: [] };

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) {
      report.alreadyApplied.push(migration.id);
      continue;
    }

    db.transaction(() => {
      migration.up(db);
      db.sqlite
        .prepare('INSERT INTO "schema_migrations" ("id", "appliedAt") VALUES (?, ?)')
        .run(migration.id, now());
    });
    report.applied.push(migration.id);
  }

  const { addable, manual } = findMissingColumns(db);
  if (addable.length > 0) {
    db.transaction(() => {
      for (const fix of addable) {
        db.sqlite.exec(fix.sql);
      }
    });
  }
  report.addedColumns = addable;
  report.manualColumns = manual;

  return report;
}
