import type { D1Database } from "@cloudflare/workers-types";
import { createTableStatements } from "./sql.ts";

export async function bootstrapD1Schema(db: D1Database): Promise<void> {
  for (const statement of createTableStatements) {
    await db.exec(statement);
  }
}
