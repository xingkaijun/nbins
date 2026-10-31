import type { SqlDatabase } from "../platform/sql-database.ts";
import { schemaStatements } from "./sql.ts";

/** Create every table and index of the baseline schema (idempotent: IF NOT EXISTS). */
export async function bootstrapSchema(db: Pick<SqlDatabase, "exec">): Promise<void> {
  for (const statement of schemaStatements) {
    await db.exec(statement);
  }
}
