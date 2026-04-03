import test from "node:test";
import assert from "node:assert/strict";
import { D1InspectionStorage } from "./d1-inspection-storage.ts";
import { createBaselineInspectionStorage } from "./mock-inspection-db.ts";

class FakePreparedStatement {
  #db;
  #sql;
  #params = [];

  constructor(db, sql) {
    this.#db = db;
    this.#sql = sql;
  }

  bind(...params) {
    this.#params = params;
    return this;
  }

  async all() {
    return { results: this.#db.select(this.#sql) };
  }

  async run() {
    this.#db.execute(this.#sql, this.#params);
    return { success: true };
  }
}

class FakeD1Database {
  constructor() {
    this.tables = {
      users: [],
      projects: [],
      ships: [],
      inspection_items: [],
      inspection_rounds: [],
      comments: []
    };
  }

  prepare(sql) {
    return new FakePreparedStatement(this, sql);
  }

  async batch(statements) {
    for (const statement of statements) {
      await statement.run();
    }

    return [];
  }

  select(sql) {
    const [, tableName] = sql.match(/FROM "([^"]+)"/) ?? [];
    return [...this.tables[tableName]];
  }

  execute(sql, params) {
    const deleteMatch = sql.match(/DELETE FROM "([^"]+)"/);

    if (deleteMatch) {
      this.tables[deleteMatch[1]] = [];
      return;
    }

    const insertMatch = sql.match(/INSERT INTO "([^"]+)" \(([^)]+)\)/);

    if (!insertMatch) {
      throw new Error(`Unsupported SQL: ${sql}`);
    }

    const [, tableName, rawColumns] = insertMatch;
    const columns = rawColumns.split(",").map((column) => column.trim().replaceAll('"', ""));
    const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
    this.tables[tableName].push(row);
  }
}

test("D1InspectionStorage reads and writes repository snapshots", async () => {
  const db = new FakeD1Database();
  const storage = new D1InspectionStorage(db);
  const baseline = createBaselineInspectionStorage();

  await storage.write(baseline);
  const snapshot = await storage.read();

  assert.deepEqual(snapshot, baseline);
});
